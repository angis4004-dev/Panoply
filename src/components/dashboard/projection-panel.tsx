import { TrendingUp } from 'lucide-react';
import type { RiskProfile } from '@/lib/types';
import { projectInvestment, PROJECTION_DAYS } from '@/lib/investment-projection';

/**
 * A modelled outcome, shown as a scenario and never as a balance.
 *
 * Everything here is the output of src/lib/investment-projection.ts: what a
 * position would be worth if the market moved far enough to return the target
 * its risk profile is modelled against. None of it is money held, earned, or
 * owed, which is why the panel keeps its own surface, says "modelled" on every
 * figure that is one, and carries the qualifier at the bottom rather than in a
 * tooltip nobody opens.
 *
 * The pricing detail - instrument, position size, the price move the target
 * implies - is deliberately not rendered. It belongs in the engine and its
 * tests; on screen it would read as a trade recommendation.
 */

const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProjectionPanel({
  capital,
  riskProfile,
  /** The instrument the scenario is priced in. Not displayed; see above. */
  instrument = 'BTC/USDT',
  initialPrice = 60000,
  className = '',
}: {
  capital: number;
  riskProfile: RiskProfile;
  instrument?: string;
  initialPrice?: number;
  className?: string;
}) {
  const projection = projectInvestment({ capital, riskProfile, instrument, initialPrice });

  return (
    <section
      aria-labelledby="projection-heading"
      className={`rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-ds-text-muted">
          <TrendingUp className="h-4 w-4" aria-hidden />
          <h3 id="projection-heading" className="text-xs font-bold uppercase tracking-widest">
            {PROJECTION_DAYS}-day scenario
          </h3>
        </div>
        <span className="rounded-full border border-ds-border px-2.5 py-0.5 text-xs text-ds-text-muted">
          Modelled, not a forecast
        </span>
      </div>

      {projection ? (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ds-text-muted">Capital</dt>
              <dd className="mt-1 font-mono text-lg text-ds-text">{usd(projection.capital)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ds-text-muted">Target gain</dt>
              <dd className="mt-1 font-mono text-lg text-ds-text">
                {projection.projectedGainPct.toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ds-text-muted">Modelled profit</dt>
              <dd className="mt-1 font-mono text-lg text-ds-value-positive">
                +{usd(projection.projectedPnl)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ds-text-muted">Modelled value</dt>
              <dd className="mt-1 font-mono text-lg text-ds-text">
                {usd(projection.projectedPortfolioValue)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-ds-text-muted">
            A scenario for a {projection.riskProfile} profile: what {usd(projection.capital)} would
            be worth over {projection.periodDays} days if the market moved far enough to return{' '}
            {projection.projectedGainPct.toFixed(0)}%. It is not a prediction, not an offer, and not
            your balance. Real results differ and crypto positions can lose money.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-ds-text-muted">
          Add capital to model a {PROJECTION_DAYS}-day scenario.
        </p>
      )}
    </section>
  );
}
