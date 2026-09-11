import type { Holding, PortfolioReport, RiskProfile } from '@/lib/types';
import { BRAND_COLORS } from '@/lib/brand-colors';
import { EMAIL_STYLE, escapeHtml, renderEmail, renderEmailHeading } from '@/lib/email-template';

/**
 * The portfolio report email, on the shared template.
 *
 * It used to be its own document inside the API route: a `<style>` block of
 * classes (which Gmail strips in several contexts, taking the section styling
 * with it), a system-font stack Outlook replaces with Times New Roman, a
 * five-column holdings table and three-across metric tiles that could not fit
 * a phone, and a different masthead from every other email the product sends.
 * It also interpolated the token and chain names - free text typed by the
 * user - straight into the HTML.
 *
 * Now it is the same card as the sign-up and reset emails, with the report's
 * tables passed in as `blocks`. Every table here is built for a ~307px phone
 * column first: two columns wherever the data allows, numbers right-aligned,
 * and detail moved into a grey subline rather than into more columns. Every
 * user-supplied string goes through `escapeHtml`.
 */

const { font: FONT, ink: INK, bodyText: BODY_TEXT, muted: MUTED, hairline: HAIRLINE } = EMAIL_STYLE;

/**
 * Text/background pairs per risk profile, drawn from the app's own palette
 * rather than a traffic-light red/yellow/green, so the report reads as coming
 * from the same picker the user chose their profile in.
 */
const RISK_COLORS: Record<RiskProfile, { text: string; bg: string }> = {
  conservative: { text: '#00A884', bg: '#E3FBF5' },
  moderate: { text: BRAND_COLORS.blue, bg: '#FFF0C9' },
  aggressive: { text: BRAND_COLORS.purple, bg: '#F1ECFF' },
};

/** Cycled per holding in the allocation bar. Brand colours first. */
const CHART_COLORS = [
  BRAND_COLORS.blue,
  BRAND_COLORS.cyan,
  BRAND_COLORS.purple,
  BRAND_COLORS.green,
  '#F2A65A',
  '#E5555A',
];

/**
 * Strategy types recommended across the four quarters, by risk profile. The
 * real strategy types from create-bot-modal.tsx, not invented labels.
 */
const STRATEGY_CYCLE: Record<RiskProfile, string[]> = {
  conservative: ['DCA', 'Trailing Stop', 'DCA', 'Trailing Stop'],
  moderate: ['Grid', 'DCA', 'Arbitrage', 'Grid'],
  aggressive: ['Arbitrage', 'Grid', 'Trailing Stop', 'Arbitrage'],
};

export interface QuarterPlanEntry {
  quarter: string;
  projectedValue: number;
  strategy: string;
  pair: string;
  locked: boolean;
}

/**
 * Fixed locale, so the same portfolio renders the same figures whatever the
 * server's locale happens to be - `toLocaleString(undefined)` on a shared host
 * is a setting nobody here controls.
 */
function usd(value: number, decimals = 2): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * A quarter's recommendation is shown only if the user's tier has that many
 * signal-flow slots - the same cap /api/bots enforces - so a one-slot account
 * sees one live recommendation, not four it cannot run. Projected value still
 * compounds across all four: those are the user's own numbers, not a locked
 * insight.
 */
export function buildQuarterlyPlan(
  riskProfile: RiskProfile,
  holdings: Holding[],
  totalValue: number,
  targetReturnPct: number,
  slotLimit: number
): QuarterPlanEntry[] {
  const quarterlyRate = Math.pow(1 + targetReturnPct / 100, 1 / 4) - 1;
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const pair = `${sorted[0]?.token || 'BTC'}/${sorted[1]?.token || 'USDT'}`;
  const strategies = STRATEGY_CYCLE[riskProfile] || STRATEGY_CYCLE.moderate;

  return [0, 1, 2, 3].map((i) => ({
    quarter: `Q${i + 1}`,
    projectedValue: totalValue * Math.pow(1 + quarterlyRate, i + 1),
    strategy: strategies[i % strategies.length],
    pair,
    locked: i >= slotLimit,
  }));
}

/** One label/value row. The two-column shape that survives any width. */
function row(label: string, valueHtml: string, first = false): string {
  const border = first ? '' : `border-top:1px solid ${HAIRLINE};`;
  return `<tr>
      <td style="${border}padding:10px 12px 10px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${BODY_TEXT};">${label}</td>
      <td align="right" style="${border}padding:10px 0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${INK};">${valueHtml}</td>
    </tr>`;
}

function table(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${rows}</table>`;
}

function riskChip(text: string, colors: { text: string; bg: string }): string {
  return `<span style="display:inline-block;color:${colors.text};background:${colors.bg};border-radius:999px;padding:1px 10px;font-weight:700;">${escapeHtml(text)}</span>`;
}

function renderSummary(report: PortfolioReport, risk: { text: string; bg: string }): string {
  const { metrics } = report;
  return (
    renderEmailHeading('At a glance') +
    table(
      row('Total value', usd(report.totalValue), true) +
        row('Risk score', riskChip(`${report.riskScore}/10`, risk)) +
        row('Largest position', `${metrics.concentration.toFixed(1)}%`) +
        row('Volatility (annualised)', `${metrics.volatility.toFixed(1)}%`) +
        row('Sharpe ratio', escapeHtml(String(metrics.sharpe))) +
        row('Target return', `${metrics.targetReturn}% a year`)
    )
  );
}

/**
 * A bar of coloured cells sized by percentage, plus a text legend.
 *
 * A real pie chart needs an image or a canvas, neither of which an email can
 * draw. Percentage-width cells render identically everywhere a table does,
 * and the legend carries the same information without relying on colour.
 */
function renderAllocation(holdings: Holding[], totalValue: number): string {
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const color = (i: number) => CHART_COLORS[i % CHART_COLORS.length];

  const bar = sorted
    .map(
      (h, i) =>
        `<td width="${share(h.value, totalValue).toFixed(2)}%" bgcolor="${color(i)}" style="height:14px;font-size:0;line-height:0;">&nbsp;</td>`
    )
    .join('');

  const legend = sorted
    .map(
      (h, i) => `<tr>
        <td width="18" style="padding:6px 0;"><span style="display:inline-block;width:10px;height:10px;background:${color(i)};border-radius:2px;"></span></td>
        <td style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${INK};">${escapeHtml(h.token)}</td>
        <td align="right" style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${BODY_TEXT};">${share(h.value, totalValue).toFixed(1)}%</td>
      </tr>`
    )
    .join('');

  return (
    renderEmailHeading('Allocation') +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:4px;overflow:hidden;"><tr>${bar}</tr></table>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px;">${legend}</table>`
  );
}

/**
 * Two columns: the asset with its detail underneath, and its value.
 *
 * The old table had five columns - token, amount, price, value, chain - which
 * at phone width meant either unreadable text or sideways scrolling. Amount,
 * price and chain are still all here, in the grey line under each token.
 */
function renderHoldings(holdings: Holding[]): string {
  const rows = holdings
    .map((h, i) => {
      const detail = `${escapeHtml(h.chain)} &middot; ${h.amount.toFixed(4)} @ ${usd(h.price)}`;
      const asset = `${escapeHtml(h.token)}<br /><span style="font-size:12px;line-height:18px;font-weight:400;color:${MUTED};">${detail}</span>`;
      return row(asset, usd(h.value), i === 0);
    })
    .join('');
  return renderEmailHeading('Holdings') + table(rows);
}

function renderQuarterly(plan: QuarterPlanEntry[], targetReturn: number): string {
  const rows = plan
    .map((q, i) => {
      const flow = q.locked
        ? `<span style="color:${MUTED};font-weight:400;">Upgrade your tier to unlock</span>`
        : `${escapeHtml(q.strategy)} &middot; ${escapeHtml(q.pair)}`;
      const label = `<strong style="color:${INK};">${q.quarter}</strong> &nbsp;${usd(q.projectedValue, 0)}`;
      return row(label, flow, i === 0);
    })
    .join('');

  return (
    renderEmailHeading('Quarterly outlook') +
    `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">Projected value if your ${targetReturn}% annual target compounds evenly each quarter. Signal flows are limited to the slots your tier can run.</p>` +
    table(rows)
  );
}

function renderRecommendations(recommendations: string[]): string {
  const items = recommendations
    .map(
      (rec) => `<tr>
        <td width="18" valign="top" style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:22px;color:${BRAND_COLORS.blue};font-weight:700;">&rarr;</td>
        <td style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:22px;color:${BODY_TEXT};">${escapeHtml(rec)}</td>
      </tr>`
    )
    .join('');
  return renderEmailHeading('Recommendations') + table(items);
}

export interface PortfolioReportEmailOptions {
  /** Signal-flow slots on the user's tier; later quarters show as locked. */
  slotLimit: number;
  /** Public origin, for the link back into the builder. */
  appUrl: string;
}

export function renderPortfolioReportEmail(
  report: PortfolioReport,
  { slotLimit, appUrl }: PortfolioReportEmailOptions
): string {
  const { holdings, totalValue, riskProfile, metrics } = report;
  const risk = RISK_COLORS[riskProfile] || RISK_COLORS.moderate;
  const top = [...holdings].sort((a, b) => b.value - a.value)[0];
  const count = holdings.length;
  const plural = count === 1 ? '' : 's';

  const summary =
    `We analysed ${count} holding${plural} worth **${usd(totalValue)}** against a ` +
    `${riskProfile} risk profile and a ${metrics.targetReturn}% annual return target.` +
    (top
      ? ` ${top.token} is your largest position, at ${share(top.value, totalValue).toFixed(1)}% of the portfolio.`
      : '');

  return renderEmail({
    eyebrow: `Portfolio report · ${report.date}`,
    title: 'Your portfolio, analysed',
    preheader: `${count} holding${plural}, ${usd(totalValue)} in total, ${riskProfile} risk profile.`,
    paragraphs: [summary],
    blocks: [
      renderSummary(report, risk),
      renderAllocation(holdings, totalValue),
      renderHoldings(holdings),
      renderQuarterly(
        buildQuarterlyPlan(riskProfile, holdings, totalValue, metrics.targetReturn, slotLimit),
        metrics.targetReturn
      ),
      renderRecommendations(report.recommendations),
      // Spacing before the button, which the template places next.
      '<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>',
    ],
    // Replaces the old "Next steps" section, which told the reader to "contact
    // our support team" without saying how. Replying to this email now reaches
    // support, and the button goes back to the tool that made the report.
    action: { label: 'Open Portfolio Builder', url: `${appUrl}/dashboard/builder` },
    footnote:
      'For information only, not financial advice. Projections assume your target return compounds evenly; real returns will differ, and crypto assets can lose value. Questions about this report? Reply to this email.',
  });
}
