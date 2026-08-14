import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Append-only record of every movement of a user's wallet capital.
 *
 * This collection - not User.walletBalanceMinor - is the authoritative record
 * of what a user's money has done. The cached balance on the user document is
 * a materialized view maintained inside the same transaction as the entry that
 * changes it, so the two cannot drift; scripts/verify-ledger.mjs proves that
 * invariant by recomputing balances from entries and comparing.
 *
 * Entries are never updated or deleted. A mistake is corrected by posting a
 * compensating entry, so the history of the correction is itself visible. The
 * pre-hooks below make that structural rather than a convention.
 */

export type LedgerEntryType =
  /** Seeded once per user by the backfill migration from their pre-ledger balance. */
  | 'opening_balance'
  /** Capital added to the wallet. */
  | 'deposit'
  /** Capital removed from the wallet. No endpoint issues these yet. */
  | 'withdrawal'
  /** Capital moved out of the wallet into a position (signal flow, vault). */
  | 'allocation'
  /** Principal returned to the wallet when a position closes. */
  | 'release'
  /** Realized profit or loss on a closed position. Not yet issued - closing a
   *  position currently returns principal only; see the release site in
   *  src/app/api/bots/[id]/route.ts for why that boundary is deliberate. */
  | 'settlement'
  /** Manual correction by an admin. Always carries actorUserId and a memo. */
  | 'admin_adjustment';

export type LedgerRelatedEntityType = 'bot' | 'vault' | 'yield';

export interface ILedgerEntry extends Document {
  userId: mongoose.Types.ObjectId;
  type: LedgerEntryType;
  /** Signed: positive credits the wallet, negative debits it. */
  amountMinor: number;
  /** Wallet balance immediately after this entry was applied. Lets any single
   *  row be checked in isolation, and makes a gap in the chain obvious. */
  balanceAfterMinor: number;
  relatedEntityType?: LedgerRelatedEntityType | null;
  relatedEntityId?: mongoose.Types.ObjectId | null;
  /** Caller-supplied de-duplication token. A replayed request carrying a key
   *  already present is a no-op rather than a second movement of money. */
  idempotencyKey?: string | null;
  /** Who caused this, when that is not the account owner. Legacy: a User id. */
  actorUserId?: mongoose.Types.ObjectId | null;
  /**
   * The admin console operator who caused this, for entries posted from the
   * console. Separate from actorUserId because an admin is no longer a row in
   * the users collection - see src/lib/models/AdminUser.ts. Both fields are
   * nullable and an entry the account owner caused has neither.
   */
  actorAdminId?: mongoose.Types.ObjectId | null;
  memo?: string;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'opening_balance',
      'deposit',
      'withdrawal',
      'allocation',
      'release',
      'settlement',
      'admin_adjustment',
    ],
  },
  amountMinor: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isSafeInteger,
      message: 'amountMinor must be an integer number of minor units.',
    },
  },
  balanceAfterMinor: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isSafeInteger,
      message: 'balanceAfterMinor must be an integer number of minor units.',
    },
  },
  relatedEntityType: { type: String, enum: ['bot', 'vault', 'yield'], default: null },
  relatedEntityId: { type: Schema.Types.ObjectId, default: null },
  // No default. A default of null would store an explicit null on every entry
  // that has no key, and those nulls collide with each other under a unique
  // index - see the index definition below.
  idempotencyKey: { type: String },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  actorAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  memo: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// Statement queries and balance recomputation both read a user's entries in
// order; this serves both.
LedgerEntrySchema.index({ userId: 1, createdAt: 1 });

/**
 * Unique so a replayed request loses the race at the database rather than in
 * application code, which is the only place it can be decided correctly under
 * concurrency.
 *
 * Partial rather than sparse. A sparse index skips documents where the field
 * is ABSENT, but still indexes an explicit null - so with a null default every
 * keyless entry indexed the same value and only one could ever be written.
 * Filtering on $type: 'string' excludes both absent and null, whatever a
 * future caller does.
 */
LedgerEntrySchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

// Append-only, enforced. Mongoose cannot intercept a raw driver call, so this
// is a guard against accidental application code, not a security boundary -
// the durable protection is a database role without update/delete on this
// collection, which is a deployment concern.
function rejectMutation(next: (err?: Error) => void) {
  next(new Error('Ledger entries are append-only; post a compensating entry instead.'));
}

for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  // Cast at the loop rather than per-call: Mongoose types `pre` as a union of
  // per-hook overloads that a variable operation name cannot satisfy, even
  // though every member takes the same next-callback shape.
  (LedgerEntrySchema.pre as unknown as (o: string, fn: typeof rejectMutation) => void)(
    op,
    rejectMutation
  );
}

export const LedgerEntryModel: Model<ILedgerEntry> =
  mongoose.models.LedgerEntry || mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);
