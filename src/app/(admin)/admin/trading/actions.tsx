'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { OctagonX, Play } from 'lucide-react';
import {
  Note,
  Panel,
  buttonClass,
  fieldClass,
  labelClass,
} from '@/components/admin-console/primitives';

/**
 * The kill switch and the risk limits.
 *
 * Both halves ask for a reason before they act. That is not ceremony: the next
 * person to open this page needs to know why the platform is in the state it
 * is in, and the moment to capture that is while the person who changed it is
 * still looking at the screen.
 */

export interface Limits {
  tradingHalted: boolean;
  haltedReason: string;
  maxOrderNotionalMinor: number;
  maxBotPositionMinor: number;
  maxUserExposureMinor: number;
  maxDailyLossMinor: number;
  minSecondsBetweenOrders: number;
}

async function patch(body: unknown): Promise<string | null> {
  const response = await fetch('/api/admin/trading-controls', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? null : (data.error ?? 'Something went wrong.');
}

/** Minor units to a plain dollar string, for an editable field. */
function toDollars(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Dollars to minor units, refusing anything with sub-cent precision.
 *
 * Rounding "10.005" silently would set a limit half a cent away from the one
 * that was typed, and the operator would have no way to see it.
 */
function toMinor(raw: string): number | 'invalid' {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'invalid';
  return Math.round(Number(value) * 100);
}

export function HaltSwitch({
  halted,
  canHalt,
  canResume,
}: {
  halted: boolean;
  canHalt: boolean;
  canResume: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const action = halted ? 'resume' : 'halt';
  const permitted = halted ? canResume : canHalt;

  if (!permitted) {
    return (
      <Note tone="neutral">
        {halted
          ? 'Only the MainAdmin can resume trading.'
          : 'You do not have permission to stop trading.'}
      </Note>
    );
  }

  async function submit() {
    setBusy(true);
    const error = await patch({ action, reason: reason.trim() });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(halted ? 'Trading resumed.' : 'Trading stopped.');
    setOpen(false);
    setReason('');
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass(halted ? 'positive' : 'danger')}
      >
        {halted ? (
          <>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Resume trading
          </>
        ) : (
          <>
            <OctagonX className="h-3.5 w-3.5" aria-hidden="true" />
            Stop all trading
          </>
        )}
      </button>
    );
  }

  return (
    <Panel className="max-w-md">
      <Note tone={halted ? 'warning' : 'danger'}>
        {halted
          ? 'Resuming lets every running signal flow place orders again on the next cycle.'
          : 'Stopping refuses every new order platform-wide, for every trader, from the next order onward. Positions already open are not closed.'}
      </Note>

      <div>
        <label className={labelClass} htmlFor="halt-reason">
          Reason
        </label>
        <input
          id="halt-reason"
          className={fieldClass}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={halted ? 'Venue issue resolved' : 'Investigating unexpected fills'}
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || reason.trim().length < 4}
          className={buttonClass(halted ? 'positive' : 'danger')}
        >
          {busy ? 'Working…' : halted ? 'Resume trading' : 'Stop all trading'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className={buttonClass('ghost')}
        >
          Cancel
        </button>
      </div>
    </Panel>
  );
}

interface FieldSpec {
  key: keyof Omit<Limits, 'tradingHalted' | 'haltedReason' | 'minSecondsBetweenOrders'>;
  label: string;
  help: string;
}

const MONEY_FIELDS: FieldSpec[] = [
  {
    key: 'maxOrderNotionalMinor',
    label: 'Max single order',
    help: 'The largest one order may be. Catches a strategy bug that tries to buy everything at once.',
  },
  {
    key: 'maxBotPositionMinor',
    label: 'Max position per flow',
    help: 'The largest position one signal flow may hold. A flow that keeps buying stops here.',
  },
  {
    key: 'maxUserExposureMinor',
    label: 'Max exposure per trader',
    help: 'The largest total cost basis one trader may hold across every flow.',
  },
  {
    key: 'maxDailyLossMinor',
    label: 'Daily loss backstop',
    help: 'Platform-wide realized loss in one UTC day that stops new buys. The backstop for a strategy that is losing correctly rather than crashing.',
  },
];

export function LimitsForm({ limits, canManage }: { limits: Limits; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState(() => ({
    maxOrderNotionalMinor: toDollars(limits.maxOrderNotionalMinor),
    maxBotPositionMinor: toDollars(limits.maxBotPositionMinor),
    maxUserExposureMinor: toDollars(limits.maxUserExposureMinor),
    maxDailyLossMinor: toDollars(limits.maxDailyLossMinor),
    minSecondsBetweenOrders: String(limits.minSecondsBetweenOrders),
  }));
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload: Record<string, number> = {};
    for (const field of MONEY_FIELDS) {
      const parsed = toMinor(form[field.key]);
      if (parsed === 'invalid') {
        toast.error(`${field.label} must be an amount like 1000 or 1000.00.`);
        return;
      }
      payload[field.key] = parsed;
    }

    const seconds = Number(form.minSecondsBetweenOrders.trim());
    if (!Number.isInteger(seconds) || seconds < 0) {
      toast.error('Minimum seconds between orders must be a whole number.');
      return;
    }
    payload.minSecondsBetweenOrders = seconds;

    setBusy(true);
    const error = await patch({ action: 'limits', ...payload });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Risk limits updated.');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Note tone="neutral">
        Every figure here is a ceiling, never a floor — nothing on this form can cause an order to
        be placed. Set a limit to <strong>0</strong> to remove it entirely.
      </Note>

      <div className="grid gap-4 sm:grid-cols-2">
        {MONEY_FIELDS.map((field) => (
          <div key={field.key}>
            <label className={labelClass} htmlFor={field.key}>
              {field.label} (USD)
            </label>
            <input
              id={field.key}
              className={fieldClass}
              inputMode="decimal"
              value={form[field.key]}
              disabled={!canManage}
              onChange={(event) => setForm((old) => ({ ...old, [field.key]: event.target.value }))}
            />
            <p className="mt-1 text-ds-caption leading-relaxed text-ds-text-muted">{field.help}</p>
          </div>
        ))}

        <div>
          <label className={labelClass} htmlFor="minSecondsBetweenOrders">
            Minimum seconds between orders
          </label>
          <input
            id="minSecondsBetweenOrders"
            className={fieldClass}
            inputMode="numeric"
            value={form.minSecondsBetweenOrders}
            disabled={!canManage}
            onChange={(event) =>
              setForm((old) => ({ ...old, minSecondsBetweenOrders: event.target.value }))
            }
          />
          <p className="mt-1 text-ds-caption leading-relaxed text-ds-text-muted">
            Per flow. Stops a misconfigured schedule from becoming a fee-generating loop against the
            venue.
          </p>
        </div>
      </div>

      {canManage ? (
        <button type="submit" disabled={busy} className={buttonClass('primary')}>
          {busy ? 'Saving…' : 'Save limits'}
        </button>
      ) : (
        <Note tone="neutral">Only the MainAdmin can change the risk limits.</Note>
      )}
    </form>
  );
}
