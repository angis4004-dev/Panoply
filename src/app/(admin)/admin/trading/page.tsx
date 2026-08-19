import React from 'react';
import { CircleAlert, OctagonX, TriangleAlert } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { loadRiskLimits } from '@/lib/models/TradingControl';
import { TradingBotModel } from '@/lib/models/TradingBot';
import { SchedulerLockModel } from '@/lib/models/SchedulerLock';
import { DepositModel } from '@/lib/models/Deposit';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import { Badge, Card, Note, Stat, money, when } from '@/components/admin-console/primitives';
import { describeExchangeConfig } from '@/lib/exchange/config';
import { getExchange } from '@/lib/exchange';
import { TRADING_LOCK } from '@/lib/exchange/scheduler';
import { HaltSwitch, LimitsForm } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The trading controls.
 *
 * Answers two questions an operator has to be able to answer instantly: is the
 * platform trading right now, and what stops it going too far. Everything on
 * this page is a brake - nothing here can cause an order to be placed.
 *
 * The page also surfaces the three things that silently prevent trading even
 * when nothing looks wrong: the halt, a missing scheduler, and paper mode.
 * Each of those has produced the same support question ("I started a flow and
 * nothing happened"), so each is stated rather than left to be inferred.
 */
export default async function TradingControlsPage() {
  const ctx = await requireAdminPage('trading.read');
  const canHalt = ctx.can('trading.halt');
  const canManage = ctx.can('trading.manage');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/trading">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  const { config } = getExchange();
  const exchange = describeExchangeConfig(config);

  const [limits, runningFlows, lastCycled, lock, pendingDeposits] = await Promise.all([
    loadRiskLimits(),
    TradingBotModel.countDocuments({ status: 'running' }),
    TradingBotModel.findOne({ lastCycleAt: { $ne: null } })
      .sort({ lastCycleAt: -1 })
      .select('lastCycleAt')
      .lean(),
    SchedulerLockModel.findOne({ name: TRADING_LOCK }).select('acquiredAt expiresAt').lean(),
    DepositModel.countDocuments({ status: 'pending' }),
  ]);

  const lastRunAt = lastCycled?.lastCycleAt ?? lock?.acquiredAt ?? null;
  /*
   * "Recently" is generous relative to the five-minute cron. A single missed
   * tick is normal - a cold start, a slow venue - and flagging it would train
   * the reader to ignore the warning that matters.
   */
  const schedulerStale = !lastRunAt || Date.now() - new Date(lastRunAt).getTime() > 20 * 60_000;
  const cronConfigured = Boolean((process.env.CRON_SECRET ?? '').trim());

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin/trading"
      pendingBadges={{ '/admin/deposits': pendingDeposits }}
    >
      <PageHeading
        title="Trading controls"
        description="The platform's brakes. Every setting here can only prevent an order — none of them can cause one."
        actions={
          <HaltSwitch halted={limits.tradingHalted} canHalt={canHalt} canResume={canManage} />
        }
      />

      {limits.tradingHalted && (
        <Note tone="danger" className="mb-4 flex items-start gap-2">
          <OctagonX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Trading is stopped.</strong> No signal flow will place an order for any trader.{' '}
            {limits.haltedReason}
          </span>
        </Note>
      )}

      {!cronConfigured && (
        <Note tone="warning" className="mb-4 flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <code>CRON_SECRET</code> is not set, so the scheduler endpoint refuses every call and no
            signal flow is ever evaluated. Flows will sit at 0.0% indefinitely. Set it in the
            deployment environment and redeploy.
          </span>
        </Note>
      )}

      {cronConfigured && schedulerStale && runningFlows > 0 && (
        <Note tone="warning" className="mb-4 flex items-start gap-2">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {runningFlows} {runningFlows === 1 ? 'flow is' : 'flows are'} running but no cycle has
            completed {lastRunAt ? <>since {when(lastRunAt)}</> : <>at all yet</>}. Check that the
            cron job is reaching <code>/api/cron/trading</code>.
          </span>
        </Note>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Trading"
          value={limits.tradingHalted ? 'Stopped' : 'Active'}
          tone={limits.tradingHalted ? 'attention' : 'neutral'}
          hint={limits.tradingHalted ? limits.haltedReason : 'Orders may be placed.'}
        />
        <Stat
          label="Venue"
          value={exchange.isLive ? 'Live' : 'Paper'}
          tone={exchange.isLive ? 'attention' : 'neutral'}
          hint={`${exchange.mode} · ${exchange.network}`}
        />
        <Stat label="Running flows" value={runningFlows} hint="Evaluated on every cycle." />
        <Stat
          label="Last cycle"
          value={lastRunAt ? when(lastRunAt) : 'Never'}
          hint="Scheduler runs every 5 minutes."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          title="Risk limits"
          description="Ceilings applied to every order, checked immediately before it is placed."
        >
          <LimitsForm limits={limits} canManage={canManage} />
        </Card>

        <div className="space-y-4">
          <Card title="Venue">
            <dl className="space-y-3 text-ds-label">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ds-text-muted">Mode</dt>
                <dd>
                  <Badge tone={exchange.isLive ? 'danger' : 'neutral'}>
                    {exchange.isLive ? 'Live money' : 'Paper'}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ds-text-muted">Adapter</dt>
                <dd className="font-mono text-ds-text">{exchange.mode}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ds-text-muted">Network</dt>
                <dd className="font-mono text-ds-text">{exchange.network}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ds-text-muted">Credentials</dt>
                <dd>
                  <Badge tone={exchange.hasCredentials ? 'positive' : 'neutral'}>
                    {exchange.hasCredentials ? 'Present' : 'None'}
                  </Badge>
                </dd>
              </div>
            </dl>

            {exchange.liveRefusedReason && (
              <Note tone="warning" className="mt-3">
                {exchange.liveRefusedReason}
              </Note>
            )}

            {!exchange.isLive && !exchange.liveRefusedReason && (
              <Note tone="neutral" className="mt-3">
                Orders are evaluated against live market prices but never sent to an exchange.
                P&amp;L shown to traders is derived from these simulated fills.
              </Note>
            )}

            <Note tone="neutral" className="mt-3">
              The venue is set by environment variables and cannot be changed from the console — an
              admin session must not be able to start trading real money.
            </Note>
          </Card>

          <Card title="Current ceilings">
            <dl className="space-y-2 font-mono text-ds-label tabular-nums">
              {(
                [
                  ['Single order', limits.maxOrderNotionalMinor],
                  ['Per flow', limits.maxBotPositionMinor],
                  ['Per trader', limits.maxUserExposureMinor],
                  ['Daily loss', limits.maxDailyLossMinor],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="font-sans text-ds-text-muted">{label}</dt>
                  <dd className="text-ds-text">{value === 0 ? 'No limit' : money(value)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="font-sans text-ds-text-muted">Order spacing</dt>
                <dd className="text-ds-text">
                  {limits.minSecondsBetweenOrders === 0
                    ? 'No limit'
                    : `${limits.minSecondsBetweenOrders}s`}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </ConsoleShell>
  );
}
