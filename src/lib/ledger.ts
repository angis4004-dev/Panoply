import mongoose, { ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import {
  LedgerEntryModel,
  type LedgerEntryType,
  type LedgerRelatedEntityType,
} from '@/lib/models/LedgerEntry';

/**
 * The only sanctioned way to move wallet capital.
 *
 * Nothing outside this module may write walletBalanceMinor. Every change is a
 * ledger entry plus a balance update committed in a single MongoDB
 * transaction, so a balance can never exist that no entry explains, and an
 * entry can never exist that the balance does not reflect.
 *
 * This replaces the previous pattern of debiting the wallet, doing the work,
 * and refunding in a catch block. That pattern is correct only while the
 * process survives: a serverless timeout, a deploy, or an OOM between the
 * debit and the refund left the user silently short with no record of it.
 */

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient wallet balance.');
    this.name = 'InsufficientFundsError';
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found.');
    this.name = 'UserNotFoundError';
  }
}

export interface PostSpec {
  userId: string | mongoose.Types.ObjectId;
  type: LedgerEntryType;
  /** Signed minor units: positive credits the wallet, negative debits it. */
  amountMinor: number;
  relatedEntityType?: LedgerRelatedEntityType;
  relatedEntityId?: string | mongoose.Types.ObjectId;
  idempotencyKey?: string;
  actorUserId?: string | mongoose.Types.ObjectId;
  memo?: string;
  /**
   * Additional counters to increment on the user document inside the same
   * transaction - lifetimeDeposited, for instance, which drives tier and must
   * not be able to disagree with the deposits that produced it.
   */
  alsoIncrement?: Record<string, number>;
}

export interface PostResult {
  balanceMinor: number;
  entryId: string;
  /** True when an entry with this idempotency key already existed and no money moved. */
  deduplicated: boolean;
}

export interface LedgerTx {
  session: ClientSession;
  post(spec: PostSpec): Promise<PostResult>;
}

async function postWithin(session: ClientSession, spec: PostSpec): Promise<PostResult> {
  const { amountMinor } = spec;

  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error('amountMinor must be an integer number of minor units.');
  }
  if (amountMinor === 0) {
    throw new Error('Refusing to post a zero-amount ledger entry.');
  }

  // Replay check runs inside the transaction so it sees a consistent snapshot.
  // The unique index on idempotencyKey is the real arbiter under a genuine
  // race - this lookup just avoids paying for the conflict in the common case.
  if (spec.idempotencyKey) {
    const existing = await LedgerEntryModel.findOne({ idempotencyKey: spec.idempotencyKey })
      .session(session)
      .lean();
    if (existing) {
      return {
        balanceMinor: existing.balanceAfterMinor,
        entryId: existing._id.toString(),
        deduplicated: true,
      };
    }
  }

  // A debit is guarded by $gte in the filter rather than a read-then-write, so
  // concurrent allocations cannot together overdraw the wallet: whichever
  // update commits second simply fails to match and is rejected.
  const filter: Record<string, unknown> = { _id: spec.userId };
  if (amountMinor < 0) {
    filter.walletBalanceMinor = { $gte: -amountMinor };
  }

  const increments: Record<string, number> = {
    walletBalanceMinor: amountMinor,
    ...(spec.alsoIncrement ?? {}),
  };

  const updated = await UserModel.findOneAndUpdate(
    filter,
    { $inc: increments },
    { new: true, session }
  )
    .select('walletBalanceMinor')
    .lean();

  if (!updated) {
    // Distinguish "no such user" from "not enough money" - they are different
    // bugs and different HTTP statuses.
    const exists = await UserModel.exists({ _id: spec.userId }).session(session);
    throw exists ? new InsufficientFundsError() : new UserNotFoundError();
  }

  const [entry] = await LedgerEntryModel.create(
    [
      {
        userId: spec.userId,
        type: spec.type,
        amountMinor,
        balanceAfterMinor: updated.walletBalanceMinor,
        relatedEntityType: spec.relatedEntityType ?? null,
        relatedEntityId: spec.relatedEntityId ?? null,
        // Omitted entirely when absent rather than set to null, so the partial
        // unique index on this field has nothing to collide on.
        ...(spec.idempotencyKey ? { idempotencyKey: spec.idempotencyKey } : {}),
        actorUserId: spec.actorUserId ?? null,
        memo: spec.memo ?? '',
      },
    ],
    { session }
  );

  return {
    balanceMinor: updated.walletBalanceMinor,
    entryId: entry._id.toString(),
    deduplicated: false,
  };
}

/**
 * Runs `fn` inside a transaction that also covers any ledger entries it posts.
 *
 * Use this when money moves together with other writes - allocating capital to
 * a signal flow has to create the flow and debit the wallet atomically, or
 * neither. withTransaction retries automatically on write conflicts, so `fn`
 * must be free of side effects outside the session.
 */
export async function withLedger<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
  const connection = await connectToDatabase();
  if (!connection) {
    throw new Error('Database connection unavailable');
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn({
        session,
        post: (spec) => postWithin(session, spec),
      });
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

/** Posts a single entry in its own transaction. */
export async function post(spec: PostSpec): Promise<PostResult> {
  return withLedger((tx) => tx.post(spec));
}

/** Credits the wallet. `amountMinor` must be positive. */
export async function credit(spec: Omit<PostSpec, 'amountMinor'> & { amountMinor: number }) {
  if (spec.amountMinor <= 0) throw new Error('credit requires a positive amount.');
  return post(spec);
}

/** Debits the wallet. `amountMinor` must be positive; it is negated here. */
export async function debit(spec: Omit<PostSpec, 'amountMinor'> & { amountMinor: number }) {
  if (spec.amountMinor <= 0) throw new Error('debit requires a positive amount.');
  return post({ ...spec, amountMinor: -spec.amountMinor });
}

/** Reads the cached balance. */
export async function getBalanceMinor(userId: string | mongoose.Types.ObjectId): Promise<number> {
  const user = await UserModel.findById(userId).select('walletBalanceMinor').lean();
  if (!user) throw new UserNotFoundError();
  return user.walletBalanceMinor ?? 0;
}

/**
 * Recomputes the balance from the entries themselves.
 *
 * The cached balance should always equal this. Anywhere it does not is a bug
 * that the cache alone could never have surfaced - which is the point of
 * keeping the ledger authoritative.
 */
export async function recomputeBalanceMinor(
  userId: string | mongoose.Types.ObjectId
): Promise<number> {
  const [totals] = await LedgerEntryModel.aggregate<{ total: number }>([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);
  return totals?.total ?? 0;
}
