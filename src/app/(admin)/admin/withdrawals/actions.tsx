'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Send, X } from 'lucide-react';
import {
  Note,
  Panel,
  buttonClass,
  fieldClass,
  labelClass,
} from '@/components/admin-console/primitives';

/**
 * Deciding a withdrawal.
 *
 * Three actions, each behind its own confirmation step with a field to fill in.
 * None of them is a bare button: approving debits a trader's wallet and marking
 * paid asserts that money left the building, and neither should be one
 * mis-aimed click away.
 */

export interface ConsoleWithdrawal {
  id: string;
  userName: string | null;
  userEmail: string | null;
  amountMinor: number;
  networkKey: string;
  coin: string;
  destinationAddress: string;
  destinationMemo: string | null;
  status: string;
}

function money(minor: number): string {
  return `$${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function decide(id: string, body: unknown): Promise<string | null> {
  const response = await fetch(`/api/admin/withdrawals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? null : (data.error ?? 'Something went wrong.');
}

type Mode = 'approve' | 'reject' | 'mark_paid' | null;

export function WithdrawalActions({ row }: { row: ConsoleWithdrawal }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!mode) return;
    setBusy(true);

    const body =
      mode === 'approve'
        ? { action: 'approve', reviewNote: text.trim() }
        : mode === 'reject'
          ? { action: 'reject', reason: text.trim() }
          : { action: 'mark_paid', txReference: text.trim() };

    const error = await decide(row.id, body);
    setBusy(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(
      mode === 'approve'
        ? `Approved. ${money(row.amountMinor)} debited.`
        : mode === 'reject'
          ? 'Withdrawal rejected. Nothing was debited.'
          : 'Marked paid.'
    );
    setMode(null);
    setText('');
    router.refresh();
  }

  if (row.status === 'rejected' || row.status === 'paid') return null;

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        {row.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => setMode('approve')}
              className={buttonClass('positive')}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => setMode('reject')}
              className={buttonClass('danger')}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </button>
          </>
        )}
        {row.status === 'approved' && (
          <button
            type="button"
            onClick={() => setMode('mark_paid')}
            className={buttonClass('primary')}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Mark paid
          </button>
        )}
      </div>
    );
  }

  const minLength = mode === 'approve' ? 0 : mode === 'reject' ? 4 : 6;

  return (
    <Panel className="max-w-lg">
      {mode === 'approve' && (
        <Note tone="warning">
          Approving debits {money(row.amountMinor)} from{' '}
          {row.userName ?? row.userEmail ?? 'this trader'} immediately. Send the transfer
          afterwards, then mark it paid with the transaction hash.
        </Note>
      )}
      {mode === 'reject' && (
        <Note tone="neutral">
          Nothing is debited. The trader is told the reason you give here, so write it for them.
        </Note>
      )}
      {mode === 'mark_paid' && (
        <Note tone="neutral">
          Records that the transfer went out. The wallet was already debited at approval, so this
          moves no money — it attaches the evidence.
        </Note>
      )}

      <div className="rounded-lg border border-ds-border bg-ds-surface-inset p-2.5">
        <div className="text-ds-caption uppercase text-ds-text-muted">Destination</div>
        <div className="mt-0.5 break-all font-mono text-ds-caption text-ds-text">
          {row.destinationAddress}
        </div>
        {row.destinationMemo && (
          <div className="mt-1 font-mono text-ds-caption text-ds-value-warning">
            Memo: {row.destinationMemo}
          </div>
        )}
        <div className="mt-1 text-ds-caption text-ds-text-muted">
          {row.coin} on {row.networkKey}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor={`field-${row.id}`}>
          {mode === 'approve'
            ? 'Review note (optional)'
            : mode === 'reject'
              ? 'Reason (shown to the trader)'
              : 'Transaction hash'}
        </label>
        <input
          id={`field-${row.id}`}
          className={fieldClass}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            mode === 'approve'
              ? 'Checked against deposit history'
              : mode === 'reject'
                ? 'Why this cannot be paid'
                : '0x…'
          }
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length < minLength}
          className={buttonClass(
            mode === 'approve' ? 'positive' : mode === 'reject' ? 'danger' : 'primary'
          )}
        >
          {busy
            ? 'Working…'
            : mode === 'approve'
              ? `Approve ${money(row.amountMinor)}`
              : mode === 'reject'
                ? 'Reject'
                : 'Mark paid'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(null);
            setText('');
          }}
          disabled={busy}
          className={buttonClass('ghost')}
        >
          Cancel
        </button>
      </div>
    </Panel>
  );
}
