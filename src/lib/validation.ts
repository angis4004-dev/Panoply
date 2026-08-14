import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Request validation at the route boundary.
 *
 * Every route previously hand-rolled its own checks, and they drifted: the
 * signal-flow endpoint verified that an amount was finite while the vault
 * endpoint checked only `!amount || amount <= 0`, which accepts Infinity. The
 * schemas here are the single description of what each endpoint accepts, so a
 * rule cannot be present in one place and missing in its neighbour.
 */

export interface ValidationFailure {
  response: NextResponse;
}

/**
 * Turns a zod issue into something worth showing a user.
 *
 * An absent field otherwise reports "Invalid input: expected string, received
 * undefined", which describes the parser's disappointment rather than what the
 * caller has to do. Every other message comes from the schema and is already
 * phrased for a person.
 */
function describe(issue: z.core.$ZodIssue): string {
  const missing = issue.code === 'invalid_type' && /received (undefined|null)/.test(issue.message);
  return missing ? 'is required' : issue.message;
}

/**
 * Parses and validates a JSON body.
 *
 * Returns either the typed data or a ready-made 400. Errors name the offending
 * field: "Amount must be greater than 0" is actionable, "Invalid input" is not.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T>; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: describe(i),
    }));
    const first = issues[0];
    return {
      data: null,
      error: NextResponse.json(
        {
          error: first.field ? `${first.field}: ${first.message}` : first.message,
          // Full list so a form can mark several fields at once, while the
          // single message above stays usable for a toast.
          issues,
        },
        { status: 400 }
      ),
    };
  }

  return { data: result.data, error: null };
}

/** A 24-character hex Mongo ObjectId. */
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

/**
 * A monetary amount in dollars, as it arrives from a client.
 *
 * Coerced because JSON bodies carry numbers as strings often enough to matter,
 * and finite-checked because `Infinity` and `NaN` both slipped past at least
 * one hand-rolled check. The precise cent conversion and ceiling still belong
 * to lib/money.ts - this only guarantees the shape.
 */
export const dollarAmount = z.coerce
  .number({ message: 'must be a number' })
  .refine(Number.isFinite, 'must be a finite number')
  .positive('must be greater than 0');

export const pinCode = z.string().regex(/^\d{6}$/, 'must be exactly 6 digits');

export const email = z.string().trim().toLowerCase().email('must be a valid email address');

// --- Route schemas -------------------------------------------------------

export const depositSchema = z.object({
  amount: dollarAmount,
});

export const createBotSchema = z.object({
  type: z.enum(['Grid', 'DCA', 'Arbitrage', 'Trailing Stop']),
  pair: z.string().trim().min(1, 'is required'),
  confidence: z.coerce.number().min(0).max(100),
  status: z.enum(['running', 'paused', 'fallback']),
  allocatedAmount: dollarAmount,
  pnl: z.string().optional(),
});

export const updateBotSchema = z.object({
  status: z.enum(['running', 'paused', 'fallback']).optional(),
  confidence: z.coerce.number().min(0).max(100).optional(),
});

export const vaultInvestmentSchema = z.object({
  vaultId: objectId,
  amount: dollarAmount,
});

export const kycSubmissionSchema = z.object({
  fullName: z.string().trim().min(1, 'is required'),
  dateOfBirth: z.string().trim().min(1, 'is required'),
  country: z.string().trim().min(1, 'is required'),
  idType: z.enum(['passport', 'drivers_license', 'national_id']),
  idNumber: z.string().trim().min(1, 'is required'),
  documentProvided: z.boolean().optional(),
});

/**
 * A discriminated union rather than one object with a refinement.
 *
 * Both express "a rejection needs a reason", but only this one proves it to
 * the type checker: after narrowing on `action`, `reason` is a plain string on
 * the reject branch, so the route cannot reach a `reason.trim()` that the
 * compiler has to be talked out of worrying about.
 */
export const kycDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    reason: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(1, 'A rejection reason is required'),
  }),
]);

/**
 * Administrative edits to a user.
 *
 * Every field optional - the dashboard PATCHes only what changed - but each
 * one typed, because this endpoint reaches a wallet balance. `role` is
 * deliberately absent: privilege changes are not a field edit, and leaving it
 * out of the schema means a future edit to the route's field map cannot
 * quietly make it one.
 */
export const adminUserUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'is required').optional(),
    email: email.optional(),
    risk: z.enum(['Conservative', 'Balanced', 'Aggressive']).optional(),
    riskProfile: z.enum(['Conservative', 'Balanced', 'Aggressive']).optional(),
    status: z.enum(['active', 'flagged', 'onboarding', 'suspended']).optional(),
    bots: z.coerce.number().int().min(0).optional(),
    value: z.string().optional(),
    portfolioValue: z.string().optional(),
    wallet: z.string().trim().optional(),
    walletAddress: z.string().trim().optional(),
    notes: z.string().optional(),
    // Not `dollarAmount`: an admin setting a balance to exactly zero is a
    // legitimate correction, so this allows 0 where a deposit would not.
    walletBalance: z.coerce
      .number({ message: 'must be a number' })
      .refine(Number.isFinite, 'must be a finite number')
      .min(0, 'cannot be negative')
      .optional(),
    adjustmentReason: z.string().trim().optional(),
  })
  .refine((v) => v.walletBalance === undefined || Boolean(v.adjustmentReason), {
    message: 'A reason is required when adjusting a wallet balance',
    path: ['adjustmentReason'],
  });

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(1, 'is required'),
  email,
  password: z.string().min(12, 'must be at least 12 characters'),
  role: z.enum(['Admin', 'Trader']).default('Trader'),
});

export const adminDepositAddressSchema = z.object({
  userId: objectId,
  coin: z
    .string()
    .trim()
    .min(2, 'must be at least 2 characters')
    .max(12, 'must be at most 12 characters')
    .regex(/^[a-zA-Z0-9]+$/, 'must contain only letters and numbers')
    .transform((value) => value.toUpperCase()),
  network: z.string().trim().min(2, 'is required').max(40, 'is too long'),
  address: z.string().trim().min(8, 'must be a valid wallet address').max(200, 'is too long'),
  memoTag: z.string().trim().max(100, 'is too long').optional(),
});

/**
 * Choosing a first PIN. No pendingToken: this is done from the dashboard, so
 * the session is the credential.
 */
export const pinSetSchema = z.object({
  pin: pinCode,
  confirmPin: pinCode,
});

/**
 * Clearing the dashboard PIN gate. No pendingToken: the PIN is no longer part
 * of sign-in, so the caller already holds a session and that session is the
 * credential this is checked against.
 */
export const pinVerifySchema = z.object({
  pin: pinCode,
});

/**
 * Changing a PIN from inside the account. No pendingToken: the caller is
 * already signed in, and the current PIN is what authorises the change.
 */
export const pinChangeSchema = z.object({
  currentPin: pinCode,
  pin: pinCode,
  confirmPin: pinCode,
});

/**
 * Requesting a PIN reset link. Takes no body at all: the session identifies
 * the account, so there is nothing for a caller to name. An email-addressed
 * version would let anyone trigger reset mail for any account.
 */
export const pinForgotSchema = z.object({}).loose();

export const pinResetSchema = z.object({
  token: z.string().min(1, 'is required'),
  pin: pinCode,
  confirmPin: pinCode,
});

export const signInSchema = z.object({
  email,
  // No length rule on sign-in. Rejecting a short password here would leak that
  // the stored one is longer, and the credential check is the only thing that
  // should decide this.
  password: z.string().min(1, 'is required'),
});

/** Minimum length lives here so registration and reset cannot disagree. */
export const newPassword = z.string().min(8, 'must be at least 8 characters long');

export const registerSchema = z.object({
  email,
  password: newPassword,
  fullName: z.string().trim().min(1, 'is required'),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'is required'),
  password: newPassword,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'is required'),
});

export const createReportSchema = z.object({
  title: z.string().trim().min(1, 'is required'),
  description: z.string().trim().min(1, 'is required'),
  type: z.enum(['portfolio', 'yield', 'risk', 'performance']),
  status: z.enum(['pending', 'success', 'failed']).optional(),
  date: z.union([z.string(), z.number()]).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  holdings: z.array(z.unknown()).optional(),
  recommendations: z.array(z.string()).optional(),
});

/**
 * One row of the portfolio builder, as submitted.
 *
 * Fields are optional and loosely typed on purpose: the route skips unusable
 * rows rather than rejecting the whole submission, so a single mistyped row
 * must not discard a long portfolio. The schema's job here is to guarantee the
 * shape is indexable, not to decide which rows are good.
 */
export const builderHoldingSchema = z.object({
  token: z.string().trim().optional(),
  amount: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  chain: z.string().trim().optional(),
});

export const portfolioBuilderSchema = z.object({
  holdings: z.array(builderHoldingSchema).min(1, 'must contain at least one holding'),
  // Lower-case here, unlike the User model's capitalised riskProfile - this is
  // the builder's own vocabulary and the route maps it separately.
  risk: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  targetReturn: z.coerce.number().optional(),
  maxAllocation: z.coerce.number().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'is required'),
});

export const TRACKED_SECTIONS = [
  'overview',
  'ai',
  'bots',
  'vaults',
  'yield',
  'builder',
  'history',
  'kyc',
  'settings',
] as const;

export const visitSectionSchema = z.object({
  section: z.enum(TRACKED_SECTIONS),
});

/**
 * Admin-created flow. Distinct from createBotSchema: this one identifies its
 * owner by name or email rather than taking it from the session, and carries
 * no allocatedAmount, because an admin-created flow does not debit a wallet.
 */
export const adminCreateBotSchema = z.object({
  type: z.enum(['Grid', 'DCA', 'Arbitrage', 'Trailing Stop']),
  pair: z.string().trim().min(1, 'is required'),
  user: z.string().trim().min(1, 'is required'),
  confidence: z.coerce.number().min(0).max(100),
  status: z.enum(['running', 'paused', 'fallback']),
  pnl: z.string().optional(),
});

export const adminCreateModelSchema = z.object({
  name: z.string().trim().min(1, 'is required'),
  scope: z.string().trim().min(1, 'is required'),
  confidence: z.coerce.number().min(0).max(100),
  drift: z.enum(['stable', 'watch', 'critical']),
});
