import { NextResponse } from 'next/server';
import type { PortfolioReport, Holding, RiskProfile } from '@/lib/types';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { getUserModel } from '@/lib/models';
import { consumeAttempt } from '@/lib/rate-limit';
import {
  computeTier,
  grantAchievement,
  TIER_RANK,
  TIER_SLOT_LIMITS,
} from '@/lib/achievements/engine';
import { parseBody, portfolioBuilderSchema } from '@/lib/validation';
import { sendEmail } from '@/lib/email';
import { renderPortfolioReportEmail } from '@/lib/portfolio-report-email';

// Three reports per address per 24 hours. This one sends email, so an
// ineffective limit is not just wasted compute - it is a way to have the
// platform deliver mail to an arbitrary address repeatedly. The previous
// in-process Map reset on every deploy and did not span instances; the shared
// store in lib/rate-limit.ts does both.
const REPORTS_PER_DAY = 3;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function checkRateLimit(email: string): Promise<boolean> {
  const result = await consumeAttempt(
    `report:${email.toLowerCase().trim()}`,
    REPORTS_PER_DAY,
    REPORT_WINDOW_MS
  );
  return !result.limited;
}

export async function POST(request: Request) {
  try {
    // Get session from request
    const session = await getSessionFromRequest(request);

    // Require authentication
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    /*
     * The PIN gate applies here too.
     *
     * This was the one trader route reading a session without also demanding
     * the unlock token, and it does not merely read: it writes to the user
     * document and grants achievements. A session cookie alone was therefore
     * enough to change account state without ever presenting the PIN, which
     * is exactly what the gate exists to prevent.
     */
    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }
    const dbUser = await userModel
      .findById(session.user.id)
      .select('kycStatus lifetimeDeposited portfolioReportCount distinctPortfolioAssets')
      .lean();
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    // Computed live from kycStatus/lifetimeDeposited rather than trusting a
    // cached `tier` field: accounts created before this field existed have no
    // `tier` in their raw Mongo document, so trusting a stored value would
    // wrongly gate already-verified legacy users as unverified.
    const userTier = computeTier(dbUser.kycStatus || 'unverified', dbUser.lifetimeDeposited || 0);
    const recommendationsUnlocked = TIER_RANK[userTier] >= TIER_RANK.amateur;
    // Same legacy-document gap as tier above: pre-existing accounts have no
    // distinctPortfolioAssets/portfolioReportCount key in Mongo, and .lean()
    // doesn't backfill schema defaults, so these come back undefined instead
    // of [] / 0 - crashing the .includes()/.length calls below.
    const existingAssets = dbUser.distinctPortfolioAssets || [];
    const existingReportCount = dbUser.portfolioReportCount || 0;

    const { data: body, error: invalid } = await parseBody(request, portfolioBuilderSchema);
    if (invalid) return invalid;

    // Validate each holding
    const validatedHoldings: Holding[] = [];
    let totalValue = 0;

    for (const holding of body.holdings) {
      if (!holding.token || !holding.amount || !holding.price) {
        continue; // Skip invalid holdings
      }

      // Already coerced to numbers by the schema; the guard above rejected
      // anything missing or zero.
      const amount = holding.amount;
      const price = holding.price;

      if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) {
        continue;
      }

      const value = amount * price;
      totalValue += value;

      validatedHoldings.push({
        token: holding.token,
        amount,
        price,
        value,
        chain: holding.chain || 'Ethereum',
      });
    }

    if (validatedHoldings.length === 0) {
      return NextResponse.json({ error: 'No valid holdings provided' }, { status: 400 });
    }

    // Calculate concentration (largest holding as % of total)
    const concentration =
      validatedHoldings.length > 0
        ? Math.max(...validatedHoldings.map((h) => (h.value / totalValue) * 100))
        : 0;

    // Determine risk score based on risk profile
    const riskScoreMap: Record<RiskProfile, number> = {
      conservative: 3.5,
      moderate: 6.2,
      aggressive: 8.8,
    };
    // The schema already restricts this to the three valid values, so the
    // runtime membership check it used to need is now just a default.
    const riskProfile: RiskProfile = body.risk ?? 'moderate';
    const riskScore = riskScoreMap[riskProfile] || 6.2;

    // Calculate volatility based on risk profile
    const volatilityMap: Record<RiskProfile, number> = {
      conservative: 12,
      moderate: 28,
      aggressive: 45,
    };
    const volatility = volatilityMap[riskProfile] || 28;

    // Calculate Sharpe ratio
    const targetReturn = body.targetReturn || 15;
    const sharpe = ((targetReturn - 4) / (volatility / 10)).toFixed(2);

    // Generate recommendations (same logic as frontend)
    const recs: string[] = [];
    if (concentration > (body.maxAllocation || 40)) {
      const top = validatedHoldings.sort((a, b) => b.value - a.value)[0];
      if (top) {
        recs.push(`Reduce ${top.token} allocation below ${body.maxAllocation || 40}%`);
      }
    }
    if (validatedHoldings.length < 3) {
      recs.push('Increase diversification across at least 3 assets');
    }
    const hasStablecoin = validatedHoldings.some((h) => h.token === 'USDC' || h.token === 'USDT');
    if (!hasStablecoin) {
      recs.push('Consider adding stablecoin exposure for risk management');
    }
    if (targetReturn > 20 && body.risk === 'conservative') {
      recs.push('Your target return may be unrealistic for your risk profile');
    }
    if (recs.length === 0) {
      recs.push('Maintain current allocation');
    }

    // Locked tier still gets real content - it names what's already been
    // computed rather than a single bare upsell line - the unlock is the
    // CTA, not the entire section.
    const finalRecommendations = recommendationsUnlocked
      ? recs
      : [
          `We've already run the concentration, diversification, and target-return checks against your ${validatedHoldings.length} holding${validatedHoldings.length === 1 ? '' : 's'}.`,
          'Verify KYC and deposit $1,000+ to reach Amateur tier and unlock the specific recommendations from that analysis.',
          'Every report you generate after that unlocks automatically - no need to re-submit this one.',
        ];

    // Use email from session by default, but allow override from request body
    const userEmail = session.user.email;

    // Create report object
    const report: PortfolioReport = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      riskProfile: body.risk as RiskProfile,
      totalValue,
      riskScore: riskScore.toFixed(1),
      holdings: validatedHoldings,
      recommendations: finalRecommendations,
      metrics: {
        concentration,
        volatility,
        sharpe: sharpe,
        targetReturn,
      },
      email: userEmail,
      status: 'sent',
    };

    // Check rate limit
    if (!(await checkRateLimit(report.email))) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 3 reports per 24 hours.' },
        { status: 429 }
      );
    }

    // Through the shared sender, which carries the logo attachment and the
    // Reply-To. This route used to build its own Resend call and had to keep
    // both in step by hand.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028';
    const emailSent = await sendEmail({
      to: report.email,
      subject: 'Your Panoply portfolio report',
      html: renderPortfolioReportEmail(report, {
        slotLimit: TIER_SLOT_LIMITS[userTier],
        appUrl,
      }),
    });
    const emailStatus = emailSent ? 'sent' : 'failed';

    // Update portfolio stats and grant achievements
    const newAssets = validatedHoldings
      .map((h) => h.token)
      .filter((t) => !existingAssets.includes(t));
    await userModel.findByIdAndUpdate(session.user.id, {
      $inc: { portfolioReportCount: 1 },
      $addToSet: { distinctPortfolioAssets: { $each: validatedHoldings.map((h) => h.token) } },
    });

    await grantAchievement(session.user.id, 'first_portfolio_created');
    await grantAchievement(session.user.id, 'risk_analyst');

    if (validatedHoldings.length >= 3) {
      await grantAchievement(session.user.id, 'portfolio_diversifier');
    }
    if (existingAssets.length + newAssets.length >= 5) {
      await grantAchievement(session.user.id, 'asset_explorer');
    }
    if (existingReportCount + 1 >= 3) {
      await grantAchievement(session.user.id, 'portfolio_optimizer');
    }

    // Return success with report data
    return NextResponse.json({
      success: true,
      message: emailSent
        ? 'Report generated and emailed successfully'
        : 'Report generated but email failed to send',
      report,
      emailStatus,
    });
  } catch (error) {
    console.error('Error generating portfolio report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
