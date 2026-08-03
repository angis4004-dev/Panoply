'use client';

import { useState } from 'react';
import { Bot, Pause, Play, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { CreateBotModal } from '@/components/dashboard/create-bot-modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppStore, type Bot as BotData } from '@/store/app-store';
import { useActivityPhase, type ActivityPhase } from '@/components/ui/RollingNumber';

const STATUS_STYLES: Record<string, string> = {
  paused: 'bg-[#8B95A5]/10 text-[#8B95A5]',
  fallback: 'bg-primary/10 text-primary',
};

// RUNNING keeps the brand primary color rather than green, since green is
// now reserved for HOLD (and red for SELL) - see useActivityPhase.
const ACTIVITY_STYLES: Record<ActivityPhase, string> = {
  RUNNING: 'bg-primary/10 text-primary',
  SELL: 'bg-red-500/10 text-red-400',
  HOLD: 'bg-green-400/10 text-green-400',
};

function BotCard({
  bot,
  onToggle,
  onDelete,
}: {
  bot: BotData;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isRunning = bot.status === 'running';
  const phase = useActivityPhase(isRunning);
  const badgeText = isRunning ? phase : bot.status;
  const badgeStyle = isRunning
    ? ACTIVITY_STYLES[phase]
    : STATUS_STYLES[bot.status] || STATUS_STYLES.fallback;

  return (
    <div className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5 hover:border-primary/25 transition-colors">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{bot.pair}</h3>
            <p className="text-xs text-[#8B95A5]">{bot.type} strategy</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase transition-colors duration-base ease-ds-out ${badgeStyle}`}
        >
          {badgeText}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <div>
          <p className="text-[#8B95A5]">P&amp;L</p>
          <p
            className={`font-mono font-semibold ${bot.pnl.startsWith('+') ? 'text-ds-value-positive' : 'text-ds-value-negative'}`}
          >
            {bot.pnl}
          </p>
        </div>
        <div>
          <p className="text-[#8B95A5]">Allocated</p>
          <p className="font-mono font-semibold text-white">
            {bot.allocatedAmount != null ? `$${bot.allocatedAmount.toLocaleString()}` : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[#8B95A5]">Confidence</p>
          <p className="font-mono font-semibold text-white">{bot.confidence}%</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2 border-t border-[#212A35] pt-3">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#212A35] py-1.5 text-xs font-medium text-[#8B95A5] hover:border-primary/40 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
        >
          {isRunning ? (
            <>
              <Pause className="h-3 w-3" /> Pause
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> Resume
            </>
          )}
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center rounded-lg border border-[#212A35] px-2.5 py-1.5 text-[#8B95A5] hover:border-red-500/40 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          aria-label="Delete signal flow"
        >
          <Trash2 className="h-3 w-3" />
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
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          >
            <Plus className="h-4 w-4" />
            New Signal Flow
          </button>
        }
      />

      {botsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
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
              <div className="mt-4 border-t border-[#212A35] pt-3">
                <Skeleton className="h-7 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-10 text-center">
          <Bot className="mx-auto mb-3 h-8 w-8 text-[#4b5563]" />
          <p className="text-sm text-[#8B95A5]">You haven&apos;t deployed any signal flows yet.</p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
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

      <p className="mt-8 text-center text-sm text-[#8B95A5]">
        Need a custom strategy?{' '}
        <Link
          href="/dashboard/ai"
          className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
        >
          Ask the AI Center
        </Link>
      </p>

      {modalOpen && <CreateBotModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
