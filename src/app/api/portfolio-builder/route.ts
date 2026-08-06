import { NextResponse } from 'next/server';
import type { PortfolioReport, Holding, RiskProfile } from '@/lib/types';
import { Resend } from 'resend';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { consumeAttempt } from '@/lib/rate-limit';
import {
  computeTier,
  grantAchievement,
  TIER_RANK,
  TIER_SLOT_LIMITS,
  type Tier,
} from '@/lib/achievements/engine';
import { BRAND_COLORS } from '@/lib/brand-colors';
import { AEGIS_LOGO_BASE64 } from '@/lib/email-logo';

// Text/background pairs per risk profile, drawn from the app's real brand
// values (tailwind.config.js `primary`/`brand.purple` and the `teal.600`
// used elsewhere) rather than an unrelated traffic-light red/yellow/green -
// the report should look like it came from the same picker the user chose
// their risk profile in.
const RISK_COLORS: Record<RiskProfile, { text: string; bg: string }> = {
  conservative: { text: '#00A884', bg: '#E3FBF5' }, // teal.600, matches the app's green accent
  moderate: { text: BRAND_COLORS.blue, bg: '#FFF0C9' }, // primary-foreground on primary - the app's real chip pairing
  aggressive: { text: BRAND_COLORS.purple, bg: '#F1ECFF' },
};

// The real Aegis mark, sent as a CID inline attachment (see
// sendEmailReport) and referenced here via cid: rather than a data-URI
// <img src>. Gmail strips data: URIs from HTML email bodies entirely
// (renders as a broken-image icon) - a CID attachment is the one method
// every major client, Gmail included, reliably renders inline.
const LOGO_CID = 'aegis-logo';
const LOGO_IMG = `<img src="cid:${LOGO_CID}" width="40" height="40" alt="Aegis" style="display:block;" />`;

// Email service using Resend
async function sendEmailReport(email: string, htmlContent: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not defined');
    return false;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Your Portfolio Report',
      html: htmlContent,
      attachments: [
        {
          filename: 'aegis-logo.png',
          content: AEGIS_LOGO_BASE64,
          contentType: 'image/png',
          contentId: LOGO_CID,
        },
      ],
    });
    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    // Optional: log success (remove in production if noisy)
    // console.log('Email sent via Resend:', data);
    return true;
  } catch (err) {
    console.error('Failed to send email via Resend:', err);
    return false;
  }
}

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

// A metrics-grid <div> laid out with CSS Grid doesn't survive most mail
// clients (Outlook ignores `display: grid` entirely, dropping every card to
// full width stacked with no box styling) - a table is the one layout
// primitive every client renders consistently.
function metricCell(label: string, value: string): string {
  return `<td width="33%" valign="top" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;text-align:center;font-family:Arial,sans-serif;">
              <div style="font-size:12px;color:#666666;margin-bottom:6px;">${label}</div>
              <div style="font-size:20px;font-weight:bold;color:#333333;">${value}</div>
            </td>`;
}

// Inline styles rather than a CSS class - the same Outlook-strips-<style>
// concern as the metrics grid, just for a small pill instead of a layout.
function riskBadge(text: string, colors: { text: string; bg: string }): string {
  return `<span style="display:inline-block;color:${colors.text};background:${colors.bg};border-radius:999px;padding:2px 10px;">${text}</span>`;
}

// Palette cycled per holding in the allocation bar/legend - brand colors
// first, then a couple of extra hues so a 5-6 holding portfolio still gets
// a distinct color per slice.
const CHART_COLORS = [
  BRAND_COLORS.blue,
  BRAND_COLORS.cyan,
  BRAND_COLORS.purple,
  BRAND_COLORS.green,
  '#F2A65A',
  '#E5555A',
];

// A true pie/donut chart needs canvas or an external image - not something
// an email can render live. A table row whose cells are colored and sized
// by percentage width is the standard email-safe stand-in (renders
// identically everywhere a table does), paired with a text legend so the
// breakdown is still readable without relying on color alone.
function buildAllocationChart(holdings: Holding[], totalValue: number): string {
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const bars = sorted
    .map((h, i) => {
      const pct = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      return `<td width="${pct.toFixed(2)}%" bgcolor="${color}" style="height:22px;font-size:0;line-height:0;">&nbsp;</td>`;
    })
    .join('');

  const legendRows = sorted
    .map((h, i) => {
      const pct = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      return `<tr>
        <td style="padding:4px 8px 4px 0;"><span style="display:inline-block;width:10px;height:10px;background-color:${color};border-radius:2px;"></span></td>
        <td style="padding:4px 8px;font-size:13px;color:#333;">${h.token}</td>
        <td style="padding:4px 0;font-size:13px;color:#666;text-align:right;">${pct.toFixed(1)}%</td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${bars}</tr></table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${legendRows}</table>`;
}

// Cadence of strategy types recommended across the four quarters, chosen by
// risk profile - reuses the real strategy types from create-bot-modal.tsx
// (Grid/DCA/Arbitrage/Trailing Stop), not invented labels.
const STRATEGY_CYCLE: Record<RiskProfile, string[]> = {
  conservative: ['DCA', 'Trailing Stop', 'DCA', 'Trailing Stop'],
  moderate: ['Grid', 'DCA', 'Arbitrage', 'Grid'],
  aggressive: ['Arbitrage', 'Grid', 'Trailing Stop', 'Arbitrage'],
};

interface QuarterPlanEntry {
  quarter: string;
  projectedValue: number;
  strategy: string;
  pair: string;
  locked: boolean;
}

// A quarter's recommendation is only shown if the user's real tier slot
// limit (TIER_SLOT_LIMITS, same cap enforced in /api/bots) covers that many
// concurrent signal flows - a Novice (1 slot) sees one live recommendation,
// not four they can't actually run. Projected value still compounds evenly
// across all four quarters regardless of tier - that's just their own
// numbers, not a locked insight.
function buildQuarterlyPlan(
  riskProfile: RiskProfile,
  holdings: Holding[],
  totalValue: number,
  targetReturnPct: number,
  slotLimit: number
): QuarterPlanEntry[] {
  const quarterlyRate = Math.pow(1 + targetReturnPct / 100, 1 / 4) - 1;
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const base = sorted[0]?.token || 'BTC';
  const quote = sorted[1]?.token || 'USDT';
  const pair = `${base}/${quote}`;
  const strategies = STRATEGY_CYCLE[riskProfile] || STRATEGY_CYCLE.moderate;

  return [0, 1, 2, 3].map((i) => ({
    quarter: `Q${i + 1}`,
    projectedValue: totalValue * Math.pow(1 + quarterlyRate, i + 1),
    strategy: strategies[i % strategies.length],
    pair,
    locked: i >= slotLimit,
  }));
}

function renderQuarterlyTable(plan: QuarterPlanEntry[]): string {
  const rows = plan
    .map(
      (q) => `<tr style="border-bottom:1px solid #ddd;">
        <td style="padding:10px;font-weight:bold;color:#333;">${q.quarter}</td>
        <td style="padding:10px;color:#333;">$${q.projectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
        <td style="padding:10px;color:#333;">${
          q.locked ? '🔒 Upgrade your tier to unlock this slot' : `${q.strategy} · ${q.pair}`
        }</td>
      </tr>`
    )
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr style="background-color:#f2f2f2;">
      <th style="padding:10px;text-align:left;font-size:13px;color:#333;">Quarter</th>
      <th style="padding:10px;text-align:left;font-size:13px;color:#333;">Projected Value</th>
      <th style="padding:10px;text-align:left;font-size:13px;color:#333;">Recommended Signal Flow</th>
    </tr>
    ${rows}
  </table>`;
}

// Generate HTML report from portfolio data
function generateHtmlReport(report: PortfolioReport, tier: Tier): string {
  const { date, riskProfile, totalValue, riskScore, holdings, recommendations, metrics, email } =
    report;
  const risk = RISK_COLORS[riskProfile] || RISK_COLORS.moderate;
  const topHolding = [...holdings].sort((a, b) => b.value - a.value)[0];
  const holdingCount = holdings.length;
  const totalValueStr = `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const allocationChart = buildAllocationChart(holdings, totalValue);
  const quarterlyPlan = buildQuarterlyPlan(
    riskProfile,
    holdings,
    totalValue,
    metrics.targetReturn,
    TIER_SLOT_LIMITS[tier]
  );

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Portfolio Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${BRAND_COLORS.blue}; color: #F2F5FA; padding: 30px; text-align: center; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 28px; color: ${BRAND_COLORS.cream}; }
        .header p { margin: 10px 0 0; opacity: 0.9; }
        .section { background: #f8f9fa; margin: 20px 0; padding: 25px; border-radius: 10px; border-left: 4px solid ${risk.text}; }
        .section h2 { color: ${risk.text}; margin-top: 0; }
        .holding-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .holding-table th, .holding-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .holding-table th { background-color: #f2f2f2; font-weight: 600; }
        .holding-table tr:hover { background-color: #f5f5f5; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; }
        .recommendations h3 { color: #856404; margin-top: 0; }
        .recommendations ul { padding-left: 20px; }
        .recommendations li { margin: 10px 0; }
        .footer { text-align: center; margin-top: 40px; color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px;">
          <tr>
            <td style="padding-right:10px;">${LOGO_IMG}</td>
            <td valign="middle" style="font-weight:800;letter-spacing:0.12em;text-transform:uppercase;font-size:18px;color:#F2F5FA;font-family:Arial,sans-serif;">Aegis</td>
          </tr>
        </table>
        <h1>Portfolio Analysis Report</h1>
        <p>Generated on ${date}</p>
        <p>Sent to: ${email}</p>
      </div>

      <div class="section">
        <h2>Executive Summary</h2>
        <p>We analyzed ${holdingCount} holding${holdingCount === 1 ? '' : 's'} worth <strong>$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> against a ${riskBadge(riskProfile, risk)} risk profile and a ${metrics.targetReturn}% annual return target. ${topHolding ? `${topHolding.token} is your largest position at ${((topHolding.value / totalValue) * 100).toFixed(1)}% of the portfolio` : 'Your allocation is spread evenly'}, with an overall concentration score of ${metrics.concentration.toFixed(1)}%. The full breakdown, risk metrics, and next steps are below.</p>
      </div>

      <div class="section">
        <h2>Portfolio Overview</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${metricCell('Total Portfolio Value', totalValueStr)}
            <td width="12"></td>
            ${metricCell('Risk Score', riskBadge(`${riskScore}/10`, risk))}
            <td width="12"></td>
            ${metricCell('Concentration Risk', `${metrics.concentration.toFixed(1)}%`)}
          </tr>
          <tr><td colspan="5" height="12"></td></tr>
          <tr>
            ${metricCell('Volatility (Annualized)', `${metrics.volatility.toFixed(1)}%`)}
            <td width="12"></td>
            ${metricCell('Sharpe Ratio', `${metrics.sharpe}`)}
            <td width="12"></td>
            ${metricCell('Target Return', `${metrics.targetReturn}%`)}
          </tr>
        </table>
      </div>

      <div class="section">
        <h2>Allocation</h2>
        ${allocationChart}
      </div>

      <div class="section">
        <h2>Current Holdings</h2>
        <table class="holding-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Amount</th>
              <th>Price (USD)</th>
              <th>Value (USD)</th>
              <th>Chain</th>
            </tr>
          </thead>
          <tbody>
            ${holdings
              .map(
                (h) => `
              <tr>
                <td>${h.token}</td>
                <td>${h.amount.toFixed(4)}</td>
                <td>$${h.price.toFixed(2)}</td>
                <td>$${h.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>${h.chain}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>Quarterly Outlook</h2>
        <p style="margin-top:0;color:#555;font-size:14px;">Projected value assumes your ${metrics.targetReturn}% annual target compounds evenly each quarter. Recommended signal flows are capped at how many you can actually run on your current tier.</p>
        ${renderQuarterlyTable(quarterlyPlan)}
      </div>

      <div class="section">
        <h2>Recommendations</h2>
        <div class="recommendations">
          <h3>Actionable Insights</h3>
          <ul>
            ${recommendations.map((rec) => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>Next Steps</h2>
        <p>Consider implementing these recommendations to optimize your portfolio's risk-adjusted returns. Remember to regularly review and rebalance your portfolio as market conditions change.</p>
        <p>For questions about this report or to discuss portfolio strategy, please contact our support team.</p>
      </div>

      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Aegis Portfolio Builder. All rights reserved.</p>
        <p>Disclaimer: This report is for informational purposes only and does not constitute financial advice. Cryptocurrency investments are subject to market risk. Past performance does not guarantee future results.</p>
      </div>
    </body>
    </html>
  `;
}

export async function POST(request: Request) {
  try {
    // Get session from request
    const session = await getSessionFromRequest(request);

    // Require authentication
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const body = await request.json();

    // Validate required fields
    if (!body.holdings || !Array.isArray(body.holdings)) {
      return NextResponse.json({ error: 'Invalid holdings data' }, { status: 400 });
    }

    // Validate each holding
    const validatedHoldings: Holding[] = [];
    let totalValue = 0;

    for (const holding of body.holdings) {
      if (!holding.token || !holding.amount || !holding.price) {
        continue; // Skip invalid holdings
      }

      const amount = parseFloat(holding.amount);
      const price = parseFloat(holding.price);

      if (isNaN(amount) || isNaN(price) || amount <= 0 || price <= 0) {
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
    const riskScore = riskScoreMap[body.risk] || 6.2;

    // Calculate volatility based on risk profile
    const volatilityMap: Record<RiskProfile, number> = {
      conservative: 12,
      moderate: 28,
      aggressive: 45,
    };
    const volatility = volatilityMap[body.risk] || 28;

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

    // Generate HTML report
    const htmlContent = generateHtmlReport(report, userTier);
    const emailSent = await sendEmailReport(report.email, htmlContent);
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
