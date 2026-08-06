import { describe, it, expect } from 'vitest';
import {
  adminUserUpdateSchema,
  createBotSchema,
  dollarAmount,
  kycDecisionSchema,
  objectId,
  parseBody,
  pinCode,
  registerSchema,
  signInSchema,
  vaultInvestmentSchema,
} from './validation';

/**
 * These schemas exist because the hand-rolled checks they replaced had drifted
 * apart: the signal-flow endpoint verified an amount was finite while the
 * vault endpoint next to it checked only `!amount || amount <= 0`, which
 * accepts Infinity. The cases below pin the rules that were inconsistent.
 */

function request(body: unknown): Request {
  return new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('dollarAmount', () => {
  it('rejects the values the old hand-rolled checks let through', () => {
    // `!amount || amount <= 0` passes Infinity, which then becomes NaN cents.
    expect(dollarAmount.safeParse(Infinity).success).toBe(false);
    expect(dollarAmount.safeParse(-Infinity).success).toBe(false);
    expect(dollarAmount.safeParse(NaN).success).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(dollarAmount.safeParse(0).success).toBe(false);
    expect(dollarAmount.safeParse(-1).success).toBe(false);
  });

  it('accepts numeric strings, since JSON bodies carry them', () => {
    const parsed = dollarAmount.safeParse('250.75');
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe(250.75);
  });

  it('rejects text that is not a number', () => {
    expect(dollarAmount.safeParse('abc').success).toBe(false);
    expect(dollarAmount.safeParse(null).success).toBe(false);
  });
});

describe('the two allocation endpoints agree', () => {
  it('applies the same amount rule to signal flows and vaults', () => {
    const bad = [Infinity, NaN, 0, -5, 'abc'];
    for (const amount of bad) {
      expect(
        createBotSchema.safeParse({
          type: 'Grid',
          pair: 'BTC/USDT',
          confidence: 80,
          status: 'running',
          allocatedAmount: amount,
        }).success
      ).toBe(false);

      expect(
        vaultInvestmentSchema.safeParse({
          vaultId: 'a'.repeat(24),
          amount,
        }).success
      ).toBe(false);
    }
  });
});

describe('objectId', () => {
  it('accepts a 24-character hex id and rejects anything else', () => {
    expect(objectId.safeParse('6a5cb2eb423e5ba147973196').success).toBe(true);
    expect(objectId.safeParse('nope').success).toBe(false);
    expect(objectId.safeParse('a'.repeat(23)).success).toBe(false);
    // A Mongo operator smuggled in where an id belongs.
    expect(objectId.safeParse({ $ne: null }).success).toBe(false);
  });
});

describe('pinCode', () => {
  it('requires exactly six digits', () => {
    expect(pinCode.safeParse('493712').success).toBe(true);
    expect(pinCode.safeParse('49371').success).toBe(false);
    expect(pinCode.safeParse('4937123').success).toBe(false);
    expect(pinCode.safeParse('49371a').success).toBe(false);
    expect(pinCode.safeParse(493712).success).toBe(false);
  });
});

describe('kycDecisionSchema', () => {
  it('accepts an approval without a reason', () => {
    expect(kycDecisionSchema.safeParse({ action: 'approve' }).success).toBe(true);
  });

  it('refuses a rejection with no reason', () => {
    expect(kycDecisionSchema.safeParse({ action: 'reject' }).success).toBe(false);
    expect(kycDecisionSchema.safeParse({ action: 'reject', reason: '   ' }).success).toBe(false);
  });

  it('accepts a rejection that explains itself', () => {
    const parsed = kycDecisionSchema.safeParse({ action: 'reject', reason: ' blurry document ' });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.action === 'reject') {
      expect(parsed.data.reason).toBe('blurry document');
    }
  });
});

describe('adminUserUpdateSchema', () => {
  it('refuses a balance change with no reason', () => {
    expect(adminUserUpdateSchema.safeParse({ walletBalance: 500 }).success).toBe(false);
  });

  it('allows a balance change that states why', () => {
    expect(
      adminUserUpdateSchema.safeParse({ walletBalance: 500, adjustmentReason: 'goodwill credit' })
        .success
    ).toBe(true);
  });

  it('allows setting a balance to exactly zero', () => {
    // Unlike a deposit, zeroing a balance is a legitimate correction.
    expect(
      adminUserUpdateSchema.safeParse({ walletBalance: 0, adjustmentReason: 'reset' }).success
    ).toBe(true);
  });

  it('refuses a negative balance', () => {
    expect(
      adminUserUpdateSchema.safeParse({ walletBalance: -1, adjustmentReason: 'oops' }).success
    ).toBe(false);
  });

  it('does not accept a role change', () => {
    const parsed = adminUserUpdateSchema.safeParse({ name: 'A', role: 'Admin' });
    expect(parsed.success).toBe(true);
    // Stripped rather than rejected, so an unknown key cannot become a
    // privilege escalation by way of the route's field map.
    if (parsed.success) expect('role' in parsed.data).toBe(false);
  });

  it('leaves an edit that changes nothing valid', () => {
    expect(adminUserUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe('email and password rules', () => {
  it('normalises email case and surrounding space', () => {
    const parsed = signInSchema.safeParse({ email: '  Alex@Example.COM ', password: 'x' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe('alex@example.com');
  });

  it('does not impose a length rule on an existing password', () => {
    // Rejecting a short password at sign-in would leak that the stored one is
    // longer; only the credential check should decide this.
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('requires eight characters when setting a new one', () => {
    const base = { email: 'a@b.co', fullName: 'A' };
    expect(registerSchema.safeParse({ ...base, password: 'short12' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'longenough' }).success).toBe(true);
  });
});

describe('parseBody', () => {
  it('returns typed data for a valid body', async () => {
    const { data, error } = await parseBody(
      request({ email: 'a@b.co', password: 'x' }),
      signInSchema
    );
    expect(error).toBeNull();
    expect(data?.email).toBe('a@b.co');
  });

  it('names the offending field rather than saying "invalid input"', async () => {
    const { error } = await parseBody(
      request({ email: 'not-an-email', password: 'x' }),
      signInSchema
    );
    expect(error).not.toBeNull();
    const body = await error!.json();
    expect(error!.status).toBe(400);
    expect(body.error).toContain('email');
    expect(body.issues[0].field).toBe('email');
  });

  it('reports every problem, so a form can mark several fields at once', async () => {
    const { error } = await parseBody(request({ email: 'nope', password: '' }), signInSchema);
    const body = await error!.json();
    expect(body.issues.length).toBeGreaterThan(1);
  });

  it('says a missing field "is required" rather than quoting the parser', async () => {
    // Zod's own text is "Invalid input: expected string, received undefined",
    // which describes the parser rather than what the caller has to do.
    const { error } = await parseBody(request({ email: 'a@b.co' }), signInSchema);
    const body = await error!.json();
    expect(body.error).toBe('password: is required');
    expect(body.issues[0].message).toBe('is required');
  });

  it('rejects a body that is not JSON without throwing', async () => {
    const bad = new Request('http://test/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const { data, error } = await parseBody(bad, signInSchema);
    expect(data).toBeNull();
    expect(error!.status).toBe(400);
  });
});
