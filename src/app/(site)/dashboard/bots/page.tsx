'use client';

import { useState } from 'react';
import { Pause, Play, Plus, Trash2, Waypoints } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { CreateBotModal } from '@/components/dashboard/create-bot-modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/loader';
import { useAppStore, type Bot as BotData } from '@/store/app-store';

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-primary/10 text-primary',
  paused: 'bg-ds-text-muted/10 text-ds-text-muted',
  fallback: 'bg-primary/10 text-primary',
};

/**
 * How long ago the scheduler last looked at this flow.
 *
 * Coarse on purpose. The exact second is noise; what the reader needs is
 * whether the flow is being evaluated at all.
 */
function sinceLabel(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function BotCard({
  bot,
  onToggle,
  onDelete,
}: {
  bot: BotData;
  onToggle: () => void;
  onDelete: () => Promise<void> | void;
}) {
  const isRunning = bot.status === 'running';
  const badgeStyle = STATUS_STYLES[bot.status] || STATUS_STYLES.fallback;
  /*
   * Closing is a money movement, so the button must not be able to fire twice.
   *
   * Three clicks a second apart once produced three settlements of the same
   * flow and paid its principal out three times. The server refuses the extra
   * requests now, but the ones that never leave the browser are the ones that
   * cannot race at all - and this is also what stops the trader seeing two
   * error toasts behind one successful close.
   */
  const [closing, setClosing] = useState(false);

  const handleDelete = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await onDelete();
    } finally {
      // The card usually unmounts before this runs; the guard is for the
      // failure path, where the flow is still on screen and still closable.
      setClosing(false);
    }
  };

  return (
    <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5 hover:border-primary/25 transition-colors">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Waypoints className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-ds-text">{bot.pair}</h3>
            <p className="text-xs text-ds-text-muted">{bot.type} strategy</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase transition-colors duration-base ease-ds-out ${badgeStyle}`}
        >
          {bot.status}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <div>
          <p className="text-ds-text-muted">P&amp;L</p>
          <p
            className={`font-mono font-semibold ${bot.pnl.startsWith('+') ? 'text-ds-value-positive' : 'text-ds-value-negative'}`}
          >
            {bot.pnl}
          </p>
        </div>
        <div>
          <p className="text-ds-text-muted">Allocated</p>
          <p className="font-mono font-semibold text-ds-text">
            {bot.allocatedAmount != null ? `$${bot.allocatedAmount.toLocaleString()}` : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-ds-text-muted">Confidence</p>
          <p className="font-mono font-semibold text-ds-text">{bot.confidence}%</p>
        </div>
      </div>

      {/* What the flow last decided, in its own words. A running flow that is
          waiting out a DCA interval or sitting inside its grid band is working
          correctly and doing nothing, and without this the only visible
          evidence is a P&L that never moves. */}
      {isRunning && (
        <p className="mt-3 text-xs leading-relaxed text-ds-text-muted">
          {bot.lastCycleReason ? (
            <>
              {bot.lastCycleReason}
              {bot.lastCycleAt && (
                <span className="text-ds-text-muted/70">
                  {' '}
                  · checked {sinceLabel(bot.lastCycleAt)}
                </span>
              )}
            </>
          ) : (
            'Waiting for its first scheduled check.'
          )}
        </p>
      )}
      <div className="mt-4 flex gap-2 border-t border-ds-border pt-3">
        {/* 44px minimum, per WCAG 2.5.8 and the Apple/Material guidance. These
            were 29px tall, and the delete control was a 29x29 box holding a
            12px icon - the smallest, most destructive target on the page.
            Icons go to 16px to match the rest of the dashboard rather than
            being a third size only these two buttons use. */}
        <button
          onClick={onToggle}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-ds-border px-3 text-sm font-medium text-ds-text-muted hover:border-primary/40 hover:text-ds-text transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
        >
          {isRunning ? (
            <>
              <Pause className="h-4 w-4" /> Pause
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Resume
            </>
          )}
        </button>
        <button
          onClick={handleDelete}
          disabled={closing}
          aria-busy={closing}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-ds-border text-ds-text-muted hover:border-[var(--ds-value-negative)]/40 hover:text-[var(--ds-value-negative)] transition-colors duration-fast ease-ds-out disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ds-border disabled:hover:text-ds-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-value-negative)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          aria-label={closing ? 'Closing signal flow' : 'Close signal flow and release its capital'}
        >
          {closing ? <Loader size={16} /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function BotsPage() {
  const { bots, botsLoading, toggleBot, deleteBot } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Signal Flows"
        description="Deploy and monitor automated strategies across your holdings."
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          >
            <Plus className="h-4 w-4" />
            New Signal Flow
          </button>
        }
      />

      {botsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <div className="flex justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-10" />
                </div>
              </div>
              <div className="mt-4 border-t border-ds-border pt-3">
                <Skeleton className="h-7 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-10 text-center">
          {/* #4b5563 measured 2.16:1 against this surface - close to invisible.
              The muted token is the darkest value the system allows to carry
              meaning. */}
          <Waypoints className="mx-auto mb-3 h-8 w-8 text-ds-text-muted" />
          <p className="text-sm text-ds-text-muted">
            You haven&apos;t deployed any signal flows yet.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          >
            <Plus className="h-4 w-4" />
            Deploy your first signal flow
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onToggle={() => toggleBot(bot.id)}
              onDelete={() => deleteBot(bot.id)}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-ds-text-muted">
        Need a custom strategy?{' '}
        <Link
          href="/dashboard/ai"
          className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
        >
          Ask the AI Center
        </Link>
      </p>

      {modalOpen && <CreateBotModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
