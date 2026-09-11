/**
 * How depositing works, shown until the trader's first deposit is approved.
 *
 * A deposit is the one step in the journey that leaves the site halfway
 * through: copy an address, go to another app, send, come back, paste a
 * reference. Every mistake that loses money happens in the gap. Three
 * numbered lines, read before the address is copied, are cheaper than a
 * support ticket about a transfer on the wrong network.
 *
 * Returning traders do not see it - they have done this before, and a
 * permanent explainer is one people learn to scroll past.
 */
const STEPS = [
  'Copy your Panoply address below.',
  'Send from your own wallet, on the same network shown here.',
  'Come back and paste the transaction reference.',
];

export function DepositFirstTimeSteps() {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ds-text">
        How depositing works
      </p>
      <ol className="mt-3 space-y-2">
        {STEPS.map((text, i) => (
          <li key={text} className="flex gap-3 text-sm text-ds-text-secondary">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ds-text-muted">
        Your balance updates once we match the transfer on-chain and approve it.
      </p>
    </div>
  );
}
