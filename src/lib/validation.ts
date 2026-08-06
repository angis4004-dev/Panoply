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
    const first = result.error.issues[0];
    const path = first?.path.join('.');
    return {
      data: null,
      error: NextResponse.json(
        {
          error: path ? `${path}: ${first.message}` : first.message,
          // Full list so a form can mark several fields at once, while the
          // single message above stays usable for a toast.
          issues: result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
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

export const kycDecisionSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().trim().optional(),
  })
  .refine((v) => v.action !== 'reject' || Boolean(v.reason), {
    message: 'A rejection reason is required',
    path: ['reason'],
  });

export const pinSetSchema = z.object({
  pendingToken: z.string().min(1, 'is required'),
  pin: pinCode,
  confirmPin: pinCode,
});

export const pinVerifySchema = z.object({
  pendingToken: z.string().min(1, 'is required'),
  pin: pinCode,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'is required'),
});
