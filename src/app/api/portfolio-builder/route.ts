import { NextResponse } from 'next/server';
import type { PortfolioReport, Holding, RiskProfile } from '@/lib/types';
import { Resend } from 'resend';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { grantAchievement, TIER_RANK, type Tier } from '@/lib/achievements/engine';

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

// In-memory rate limiting store (in production, use Redis)
const rateLimitStore = new Map();

// Check if user has exceeded rate limit (3 reports per 24 hours)
function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours

  if (!rateLimitStore.has(email)) {
    rateLimitStore.set(email, []);
  }

  const timestamps = rateLimitStore.get(email)!;

  // Remove timestamps older than 24 hours
  const validTimestamps = timestamps.filter((timestamp) => now - timestamp < windowMs);

  // Check if limit exceeded
  if (validTimestamps.length >= 3) {
    return false;
  }

  // Add current timestamp and update store
  validTimestamps.push(now);
  rateLimitStore.set(email, validTimestamps);

  return true;
}

// Generate HTML report from portfolio data
function generateHtmlReport(report: PortfolioReport): string {
  const { date, riskProfile, totalValue, riskScore, holdings, recommendations, metrics, email } =
    report;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Portfolio Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0; opacity: 0.9; }
        .section { background: #f8f9fa; margin: 20px 0; padding: 25px; border-radius: 10px; border-left: 4px solid #667eea; }
        .section h2 { color: #667eea; margin-top: 0; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-label { font-size: 14px; color: #666; margin-bottom: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #333; }
        .holding-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .holding-table th, .holding-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .holding-table th { background-color: #f2f2f2; font-weight: 600; }
        .holding-table tr:hover { background-color: #f5f5f5; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; }
        .recommendations h3 { color: #856404; margin-top: 0; }
        .recommendations ul { padding-left: 20px; }
        .recommendations li { margin: 10px 0; }
        .footer { text-align: center; margin-top: 40px; color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px; }
        .risk-conservative { color: #28a745; }
        .risk-moderate { color: #ffc107; }
        .risk-aggressive { color: #dc3545; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Portfolio Analysis Report</h1>
        <p>Generated on ${date}</p>
        <p>Sent to: ${email}</p>
      </div>

      <div class="section">
        <h2>Executive Summary</h2>
        <p>Your portfolio has been analyzed based on your holdings, risk profile (${riskProfile}), and investment goals. Below is a detailed breakdown of your current allocation, risk metrics, and personalized recommendations.</p>
      </div>

      <div class="section">
        <h2>Portfolio Overview</h2>
        <div class="metrics-grid">
          <div class="metric">
            <div class="metric-label">Total Portfolio Value</div>
            <div class="metric-value">$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Risk Score</div>
            <div class="metric-value"><span class="risk-${riskProfile.toLowerCase()}">${riskScore}</span>/10</div>
          </div>
          <div class="metric">
            <div class="metric-label">Concentration Risk</div>
            <div class="metric-value">${metrics.concentration.toFixed(1)}%</div>
          </div>
          <div class="metric">
            <div class="metric-label">Volatility (Annualized)</div>
            <div class="metric-value">${metrics.volatility.toFixed(1)}%</div>
          </div>
          <div class="metric">
            <div class="metric-label">Sharpe Ratio</div>
            <div class="metric-value">${metrics.sharpe}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Target Return</div>
            <div class="metric-value">${metrics.targetReturn}%</div>
          </div>
        </div>
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
      .select('tier portfolioReportCount distinctPortfolioAssets')
      .lean();
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userTier: Tier = (dbUser.tier as Tier) || 'unverified';
    const recommendationsUnlocked = TIER_RANK[userTier] >= TIER_RANK.amateur;

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

    const finalRecommendations = recommendationsUnlocked
      ? recs
      : [
          'Upgrade to Amateur tier (KYC verified + $1,000 deposited) to unlock personalized recommendations.',
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
    if (!checkRateLimit(report.email)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 3 reports per 24 hours.' },
        { status: 429 }
      );
    }

    // Generate HTML report
    const htmlContent = generateHtmlReport(report);
    const emailSent = await sendEmailReport(report.email, htmlContent);
    const emailStatus = emailSent ? 'sent' : 'failed';

    // Update portfolio stats and grant achievements
    const newAssets = validatedHoldings
      .map((h) => h.token)
      .filter((t) => !dbUser.distinctPortfolioAssets.includes(t));
    await userModel.findByIdAndUpdate(session.user.id, {
      $inc: { portfolioReportCount: 1 },
      $addToSet: { distinctPortfolioAssets: { $each: validatedHoldings.map((h) => h.token) } },
    });

    await grantAchievement(session.user.id, 'first_portfolio_created');
    await grantAchievement(session.user.id, 'risk_analyst');

    if (validatedHoldings.length >= 3) {
      await grantAchievement(session.user.id, 'portfolio_diversifier');
    }
    if (dbUser.distinctPortfolioAssets.length + newAssets.length >= 5) {
      await grantAchievement(session.user.id, 'asset_explorer');
    }
    if (dbUser.portfolioReportCount + 1 >= 3) {
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
