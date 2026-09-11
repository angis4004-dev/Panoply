import { describe, it, expect } from 'vitest';
import type { Holding, PortfolioReport } from '@/lib/types';
import { buildQuarterlyPlan, renderPortfolioReportEmail } from '@/lib/portfolio-report-email';

/**
 * The report is the one email built from free text the user typed: token and
 * chain names go in unvalidated beyond a trim. So the escaping is the first
 * thing asserted, then the layout, then the tier gating that decides what the
 * reader is shown.
 */

const holding = (token: string, amount: number, price: number, chain = 'Ethereum'): Holding => ({
  token,
  amount,
  price,
  value: amount * price,
  chain,
});

function report(holdings: Holding[], overrides: Partial<PortfolioReport> = {}): PortfolioReport {
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  return {
    id: 1,
    date: '9/11/2026',
    riskProfile: 'moderate',
    totalValue,
    riskScore: '6.2',
    holdings,
    recommendations: ['Increase diversification across at least 3 assets'],
    metrics: { concentration: 62.5, volatility: 28, sharpe: '3.93', targetReturn: 15 },
    email: 'someone@example.com',
    status: 'sent',
    ...overrides,
  } as PortfolioReport;
}

const render = (r: PortfolioReport, slotLimit = 4) =>
  renderPortfolioReportEmail(r, { slotLimit, appUrl: 'https://panoply.finance' });

const PORTFOLIO = [holding('BTC', 0.5, 62000), holding('ETH', 4, 3100), holding('USDC', 2500, 1)];

describe('portfolio report escaping', () => {
  it('escapes a token name that contains markup', () => {
    const html = render(report([holding('<img src=x onerror=alert(1)>', 1, 100)]));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the chain name too', () => {
    const html = render(report([holding('BTC', 1, 100, '<script>x</script>')]));
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('escapes recommendations, which quote token names back', () => {
    const html = render(
      report(PORTFOLIO, { recommendations: ['Reduce <b>BTC</b> allocation below 40%'] })
    );
    expect(html).not.toContain('<b>BTC</b>');
    expect(html).toContain('&lt;b&gt;BTC&lt;/b&gt;');
  });
});

describe('portfolio report layout', () => {
  it('never pins anything to a width wider than a phone', () => {
    const fixed = render(report(PORTFOLIO)).match(/style="[^"]*(?<![-\w])width:\s*(\d+)px/g) ?? [];
    const tooWide = fixed.filter((m) => Number(/(\d+)px/.exec(m)?.[1]) >= 400);
    expect(tooWide).toEqual([]);
  });

  it('uses the shared card, not a layout of its own', () => {
    const html = render(report(PORTFOLIO));
    expect(html).toContain('max-width:560px');
    expect(html).toContain('Panoply will never ask you for your password');
    // The old layout's class-based <style> sheet, which Gmail strips.
    expect(html).not.toContain('.holding-table');
  });

  it('keeps every figure the old five-column table showed', () => {
    const html = render(report([holding('BTC', 0.5, 62000, 'Bitcoin')]));
    expect(html).toContain('BTC');
    expect(html).toContain('Bitcoin');
    expect(html).toContain('0.5000');
    expect(html).toContain('$62,000.00');
    expect(html).toContain('$31,000.00');
  });

  it('links back to the builder', () => {
    expect(render(report(PORTFOLIO))).toContain('https://panoply.finance/dashboard/builder');
  });
});

describe('quarterly plan', () => {
  it('locks the quarters beyond the tier slot limit', () => {
    const plan = buildQuarterlyPlan('moderate', PORTFOLIO, 50000, 15, 1);
    expect(plan.map((q) => q.locked)).toEqual([false, true, true, true]);
  });

  it('compounds the target return to exactly one year by Q4', () => {
    const plan = buildQuarterlyPlan('moderate', PORTFOLIO, 10000, 20, 4);
    expect(plan[3].projectedValue).toBeCloseTo(12000, 6);
  });

  it('shows the upgrade prompt, not the strategy, for a locked quarter', () => {
    const html = render(report(PORTFOLIO), 1);
    expect(html.match(/Upgrade your tier to unlock/g)).toHaveLength(3);
  });
});
