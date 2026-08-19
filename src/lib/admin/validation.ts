import { z } from 'zod';
import { email, objectId, pinCode } from '@/lib/validation';
import { validateAddressRule, type AddressCharset, type AddressFamily } from '@/lib/crypto-address';
import { MIN_ADMIN_PASSWORD_LENGTH, passwordComplaint } from './credentials';
import { grantablePermissions } from './permissions';

/**
 * Request schemas for the admin console.
 *
 * Separate from src/lib/validation.ts because these describe a different
 * application. Sharing `objectId`, `email` and `pinCode` keeps the primitives
 * consistent; sharing the file would put the console's vocabulary in front of
 * every trader route that imports one symbol from it.
 */

const adminPassword = z
  .string()
  .min(MIN_ADMIN_PASSWORD_LENGTH, `must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`)
  .superRefine((value, ctx) => {
    const complaint = passwordComplaint(value);
    if (complaint) ctx.addIssue({ code: 'custom', message: complaint });
  });

export const adminLoginSchema = z.object({
  email,
  // No length or complexity rule on sign-in. Rejecting a short password here
  // would leak that the stored one is longer, and the credential check is the
  // only thing that should decide this.
  password: z.string().min(1, 'is required'),
});

export const adminPinSchema = z.object({
  pin: pinCode,
});

export const adminSetPinSchema = z.object({
  pin: pinCode,
  confirmPin: pinCode,
});

export const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'is required'),
  password: adminPassword,
});

const permissionList = z
  .array(z.string())
  .max(32)
  .refine(
    (values) => values.every((value) => (grantablePermissions() as string[]).includes(value)),
    'contains a permission that cannot be delegated'
  );

export const adminCreateSchema = z.object({
  name: z.string().trim().min(1, 'is required').max(120, 'is too long'),
  email,
  // Role is fixed at 'Admin'. There is no console path to MainAdmin - see
  // canCreateAdmin in ./permissions.ts and scripts/bootstrap-admin.mjs.
  permissions: permissionList.default([]),
});

export const adminUpdateSchema = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    permissions: permissionList.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.status !== undefined || value.permissions !== undefined, {
    message: 'Nothing to change.',
  })
  .refine((value) => value.status !== 'suspended' || Boolean(value.reason), {
    message: 'A reason is required when suspending an admin.',
    path: ['reason'],
  });

export const traderCreateSchema = z.object({
  name: z.string().trim().min(1, 'is required').max(120, 'is too long'),
  email,
  /**
   * Optional. When absent the console generates one and shows it once, which
   * is better than an operator inventing a password for somebody else.
   */
  password: z.string().min(8, 'must be at least 8 characters').optional(),
});

export const traderUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'is required').optional(),
    riskProfile: z.enum(['Conservative', 'Balanced', 'Aggressive']).optional(),
    status: z.enum(['active', 'flagged', 'onboarding', 'suspended']).optional(),
    notes: z.string().max(2000).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.riskProfile !== undefined ||
      value.status !== undefined ||
      value.notes !== undefined,
    { message: 'Nothing to change.' }
  )
  .refine((value) => value.status !== 'suspended' || Boolean(value.reason), {
    message: 'A reason is required when suspending a trader.',
    path: ['reason'],
  });

/**
 * A balance adjustment.
 *
 * `expectedBalanceMinor` is mandatory. The operator submits the balance the
 * screen showed them, and the ledger refuses the write if it has moved since -
 * otherwise two adjustments prepared from the same stale figure each apply in
 * full and the account ends up somewhere neither operator intended.
 */
export const balanceAdjustSchema = z.object({
  targetBalanceMinor: z
    .number()
    .int('must be a whole number of minor units')
    .min(0, 'cannot be negative'),
  expectedBalanceMinor: z.number().int('must be a whole number of minor units').min(0),
  reason: z.string().trim().min(8, 'must explain the adjustment'),
});

const coin = z
  .string()
  .trim()
  .min(2, 'must be at least 2 characters')
  .max(12, 'must be at most 12 characters')
  .regex(/^[a-zA-Z0-9]+$/, 'must contain only letters and numbers')
  .transform((value) => value.toUpperCase());

/**
 * A network's stable identifier, e.g. ERC20. Uppercased on the way in so that
 * "trc20" and "TRC20" cannot become two chains for the same Tron.
 */
export const networkKey = z
  .string()
  .trim()
  .min(2, 'must be at least 2 characters')
  .max(20, 'must be at most 20 characters')
  .regex(/^[a-zA-Z0-9]+$/, 'must contain only letters and numbers')
  .transform((value) => value.toUpperCase());

/**
 * The address-format columns, shared by create and update.
 *
 * Validated as a group by `refineAddressRule` rather than field by field: the
 * fields are only meaningful together, and whether any of them is required at
 * all depends on the family.
 */
const addressRuleFields = {
  addressFamily: z.enum(['evm', 'tron', 'solana', 'custom', 'none']),
  addressPrefix: z.string().trim().max(8, 'is too long').optional(),
  addressCharset: z.enum(['hex', 'base58', 'base32', 'alphanumeric']).optional(),
  addressMinLength: z.number().int('must be a whole number').min(1).max(200).optional(),
  addressMaxLength: z.number().int('must be a whole number').min(1).max(200).optional(),
};

type AddressRuleShape = {
  addressFamily?: AddressFamily;
  addressPrefix?: string;
  addressCharset?: AddressCharset;
  addressMinLength?: number;
  addressMaxLength?: number;
  memoSupported?: boolean;
  memoRequired?: boolean;
};

/**
 * Cross-field checks a per-field schema cannot express.
 *
 * The address rule goes through the same validateAddressRule the runtime
 * check uses, so a network cannot be saved with a rule that would reject every
 * address on it. The memo pair is a plain contradiction: requiring something
 * the chain is marked as not supporting means no deposit on it can ever be
 * completed.
 */
function refineAddressRule(value: AddressRuleShape, ctx: z.RefinementCtx) {
  if (value.addressFamily) {
    const complaint = validateAddressRule({
      family: value.addressFamily,
      prefix: value.addressPrefix,
      charset: value.addressCharset,
      minLength: value.addressMinLength,
      maxLength: value.addressMaxLength,
    });
    if (complaint) {
      ctx.addIssue({ code: 'custom', message: complaint, path: ['addressFamily'] });
    }
  }
  if (value.memoRequired && value.memoSupported === false) {
    ctx.addIssue({
      code: 'custom',
      message: 'A network cannot require a memo it does not support.',
      path: ['memoRequired'],
    });
  }
}

export const networkCreateSchema = z
  .object({
    key: networkKey,
    name: z.string().trim().min(2, 'is required').max(80, 'is too long'),
    description: z.string().trim().max(300, 'is too long').optional(),
    ...addressRuleFields,
    memoSupported: z.boolean().default(false),
    memoRequired: z.boolean().default(false),
    coins: z.array(coin).max(40, 'is too many coins').default([]),
    depositEnabled: z.boolean().default(true),
    withdrawalEnabled: z.boolean().default(true),
    minWithdrawalMinor: z.number().int('must be a whole number of minor units').min(0).nullable(),
    sortOrder: z.number().int().min(0).max(9999).default(100),
  })
  .superRefine(refineAddressRule);

/**
 * An edit. `key` is absent on purpose - it is written into every deposit,
 * payout address and withdrawal that names this network, and changing it would
 * detach all of that history from the row that explains it.
 */
export const networkUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'is required').max(80, 'is too long').optional(),
    description: z.string().trim().max(300, 'is too long').optional(),
    addressFamily: addressRuleFields.addressFamily.optional(),
    addressPrefix: addressRuleFields.addressPrefix,
    addressCharset: addressRuleFields.addressCharset,
    addressMinLength: addressRuleFields.addressMinLength,
    addressMaxLength: addressRuleFields.addressMaxLength,
    memoSupported: z.boolean().optional(),
    memoRequired: z.boolean().optional(),
    coins: z.array(coin).max(40, 'is too many coins').optional(),
    depositEnabled: z.boolean().optional(),
    withdrawalEnabled: z.boolean().optional(),
    minWithdrawalMinor: z
      .number()
      .int('must be a whole number of minor units')
      .min(0)
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .superRefine(refineAddressRule);

/**
 * A new platform deposit address. No trader id: one address per coin and
 * network serves everybody, so there is nobody to name.
 *
 * `network` is a key from the catalog, not free text. The address itself is
 * only length-checked here - the format check needs the network's rule, which
 * means a database read, so it happens in the route.
 */
export const depositAddressCreateSchema = z.object({
  coin,
  network: networkKey,
  address: z.string().trim().min(8, 'must be a valid wallet address').max(200, 'is too long'),
  memoTag: z.string().trim().max(100, 'is too long').optional(),
  label: z.string().trim().max(80, 'is too long').optional(),
});

export const depositAddressDeactivateSchema = z.object({
  action: z.literal('deactivate'),
  reason: z.string().trim().min(4, 'is required'),
});

/**
 * Rotation is one operation, not a deactivate followed by an assign.
 *
 * Two separate calls leave a window in which the trader has no active address
 * for that asset, and a failure between them leaves it permanently that way.
 */
export const depositAddressRotateSchema = z.object({
  action: z.literal('rotate'),
  address: z.string().trim().min(8, 'must be a valid wallet address').max(200, 'is too long'),
  memoTag: z.string().trim().max(100, 'is too long').optional(),
  label: z.string().trim().max(80, 'is too long').optional(),
  reason: z.string().trim().min(4, 'is required'),
});

export const depositAddressActionSchema = z.discriminatedUnion('action', [
  depositAddressDeactivateSchema,
  depositAddressRotateSchema,
]);

export const depositCreateSchema = z.object({
  userId: objectId,
  depositAddressId: objectId,
  assetAmount: z
    .string()
    .trim()
    .min(1, 'is required')
    .max(40, 'is too long')
    .regex(/^\d+(\.\d+)?$/, 'must be a positive decimal amount'),
  txReference: z.string().trim().min(6, 'must be a transaction hash or payment reference').max(200),
});

/** The trader-facing version: the account comes from the session, not the body. */
export const traderDepositClaimSchema = depositCreateSchema.omit({ userId: true });

export const depositDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    creditAmountMinor: z
      .number()
      .int('must be a whole number of minor units')
      .positive('must be greater than zero'),
    txReference: z.string().trim().min(6, 'is required').max(200),
    reviewNote: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(4, 'A rejection reason is required'),
  }),
]);

/**
 * A risk ceiling, in minor units.
 *
 * Zero is meaningful and must stay reachable: checkRisk reads it as "no
 * ceiling". The upper bound is a typo guard - a hundred million dollars is not
 * a limit anyone means to set, and it is one keystroke away from a plausible
 * one.
 */
const riskCeilingMinor = z
  .number()
  .int('must be a whole number of minor units')
  .min(0, 'cannot be negative')
  .max(10_000_000_000, 'is implausibly large; check the figure');

/**
 * A change to the trading controls.
 *
 * Split by action rather than made one patch object, because the two halves
 * carry different authority. `halt` is grantable to an Admin and `resume` and
 * `limits` are not, and a single shape would make that distinction something
 * the route has to remember to enforce per-field.
 */
export const tradingControlSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('halt'),
    // Required. Whoever finds the platform stopped needs to know why without
    // having to locate the person who stopped it.
    reason: z.string().trim().min(4, 'must say why trading is being stopped').max(300),
  }),
  z.object({
    action: z.literal('resume'),
    reason: z.string().trim().min(4, 'must say why trading is being resumed').max(300),
  }),
  z.object({
    action: z.literal('limits'),
    maxOrderNotionalMinor: riskCeilingMinor,
    maxBotPositionMinor: riskCeilingMinor,
    maxUserExposureMinor: riskCeilingMinor,
    maxDailyLossMinor: riskCeilingMinor,
    minSecondsBetweenOrders: z
      .number()
      .int('must be a whole number of seconds')
      .min(0, 'cannot be negative')
      .max(86_400, 'cannot exceed a day'),
  }),
]);

/**
 * An operator's decision on a withdrawal.
 *
 * `approve` takes no amount. The trader asked for a specific figure and an
 * operator who disagrees rejects the request rather than quietly paying out a
 * different number - see src/lib/models/Withdrawal.ts.
 *
 * `mark_paid` requires the transaction hash, because that reference is the
 * only durable evidence the payment was actually made.
 */
export const withdrawalDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    reviewNote: z.string().trim().max(1000).optional().default(''),
  }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(4, 'A rejection reason is required').max(1000),
  }),
  z.object({
    action: z.literal('mark_paid'),
    txReference: z.string().trim().min(6, 'The transaction reference is required').max(200),
  }),
]);

export const auditQuerySchema = z.object({
  actorAdminId: objectId.optional(),
  affectedUserId: objectId.optional(),
  action: z.string().trim().max(80).optional(),
  targetType: z
    .enum([
      'user',
      'bot',
      'kyc',
      'model',
      'admin',
      'network',
      'deposit_address',
      'payout_address',
      'deposit',
      'withdrawal',
      'session',
      'trading_control',
    ])
    .optional(),

  reference: z.string().trim().max(200).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
