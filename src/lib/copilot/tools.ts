import { getBalanceMinor } from '@/lib/ledger';
import { toDollars } from '@/lib/money';
import { computeTier, type Tier } from '@/lib/achievements/engine';
import { modelledPnlAt } from '@/lib/performance-model';
import { TradingBotModel, getUserModel } from '@/lib/models';

/**
 * Read-only account lookups for Panoply Copilot.
 *
 * ## The identity rule
 *
 * Every function here takes `userId` as its first argument and that argument
 * comes from the verified session, never from the model. There is deliberately
 * no tool the assistant can call with an id of its own choosing: the model
 * decides *what* to look up, the server decides *whose*. A user who writes
 * "fetch the portfolio for user 507f1f..." changes nothing, because there is
 * no parameter for it to land in.
 *
 * ## Read-only
 *
 * Nothing here writes. No ledger post, no status change, no order. The
 * assistant is a guide, and the blast radius of a confused model should be a
 * wrong sentence, not a wrong balance.
 *
 * ## Shape
 *
 * These return plain facts, already formatted, and the caller folds them into
 * the prompt as text. They are not exposed as callable function-tools to the
 * model: at this corpus and feature size, fetching the three things a support
 * question could need is cheaper and far more predictable than a tool-calling
 * round trip, and it removes a whole class of malformed-argument failures.
 */

export interface AccountSnapshot {
  displayName: string | null;
  tier: Tier;
  kycStatus: string;
  emailVerified: boolean;
  walletBalanceUsd: number;
  lifetimeDeposited: number;
}

export async function getAccountSnapshot(userId: string): Promise<AccountSnapshot | null> {
  const userModel = await getUserModel();
  if (!userModel) return null;

  const user = await userModel
    .findById(userId)
    .select('name kycStatus emailVerified lifetimeDeposited')
    .lean();
  if (!user) return null;

  const kycStatus = user.kycStatus || 'unverified';
  const lifetimeDeposited = user.lifetimeDeposited || 0;

  return {
    displayName: user.name || null,
    tier: computeTier(kycStatus, lifetimeDeposited),
    kycStatus,
    emailVerified: Boolean(user.emailVerified),
    walletBalanceUsd: toDollars(await getBalanceMinor(userId)),
    lifetimeDeposited,
  };
}

export interface FlowSnapshot {
  pair: string;
  type: string;
  status: string;
  allocatedUsd: number;
  /** Modelled, never executed. Named so no caller can forget which it is. */
  modelledPnlUsd: number;
  modelledPnlPercent: number;
}

/**
 * The user's signal flows, with the model's current value for each.
 *
 * The field is `modelledPnlUsd` rather than `pnl` on purpose. This object is
 * serialised straight into the prompt, so the model reads the field name as
 * part of the evidence - a key called `profit` would be quietly arguing
 * against the system prompt's central instruction on every single request.
 */
export async function getSignalFlows(userId: string): Promise<FlowSnapshot[]> {
  const flows = await TradingBotModel.find({ userId }).lean();
  const at = Date.now();

  return flows.map((flow) => {
    const allocated = flow.allocatedAmount ?? 0;
    const modelled = modelledPnlAt({
      flowId: String(flow._id),
      allocatedCapital: allocated,
      createdAt: flow.createdAt,
      at,
    });
    return {
      pair: flow.pair,
      type: flow.type,
      status: flow.status,
      allocatedUsd: allocated,
      modelledPnlUsd: Number(modelled.toFixed(2)),
      modelledPnlPercent: allocated > 0 ? Number(((modelled / allocated) * 100).toFixed(2)) : 0,
    };
  });
}

/**
 * Render the account facts as prompt text.
 *
 * Assembled here rather than in the service so there is exactly one place
 * where account data is turned into words, and the modelled-versus-real
 * distinction is restated at the point the numbers appear - the model sees
 * the caveat adjacent to the figure, not only in a system prompt several
 * thousand tokens earlier.
 */
export function renderAccountContext(
  account: AccountSnapshot | null,
  flows: FlowSnapshot[]
): string {
  if (!account) return 'No account data is available for this user.';

  const lines = [
    "## This user's account (authoritative — use these figures, do not estimate)",
    `Tier: ${account.tier}`,
    `Identity verification: ${account.kycStatus}`,
    `Email verified: ${account.emailVerified ? 'yes' : 'no'}`,
    `Wallet balance: $${account.walletBalanceUsd.toFixed(2)} — REAL money on the ledger, the only withdrawable figure`,
    `Lifetime deposited: $${account.lifetimeDeposited.toFixed(2)}`,
  ];

  if (flows.length === 0) {
    lines.push('Signal flows: none created yet.');
  } else {
    lines.push(
      `Signal flows: ${flows.length}. The P&L figures below are produced by Panoply's`,
      'performance model. No order was placed and no trade was executed for any of them.',
      'You must say so whenever you mention any of these numbers.'
    );
    for (const f of flows) {
      lines.push(
        `- ${f.pair} (${f.type}, ${f.status}): $${f.allocatedUsd.toFixed(2)} allocated, ` +
          `modelled P&L $${f.modelledPnlUsd.toFixed(2)} (${f.modelledPnlPercent.toFixed(2)}%)`
      );
    }
  }

  return lines.join('\n');
}
