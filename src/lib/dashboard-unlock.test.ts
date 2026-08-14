import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  UNLOCK_HEADER,
  createDashboardUnlockToken,
  requireUnlock,
  unlockMatchesSession,
  unlockFailureResponse,
  verifyDashboardUnlockToken,
} from './dashboard-unlock';

/**
 * The rule the dashboard PIN gate rests on.
 *
 * The overlay in the browser is presentation: it decides what a user sees.
 * This decides what the server will answer, and it is the half that has to
 * hold when the overlay is deleted from the DOM, the component state is set to
 * "unlocked" by hand, or the request never came from the app at all.
 */

const SESSION = { user: { id: 'trader-1', tokenVersion: 3 } };

function unlocked(session = SESSION) {
  return createDashboardUnlockToken(session.user.id, session.user.tokenVersion);
}

function requestWith(token?: string | null, url = 'https://app.example.com/api/wallet') {
  return new Request(url, {
    headers: token ? { [UNLOCK_HEADER]: token } : {},
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('unlock tokens', () => {
  it('round-trips a token it minted', () => {
    const payload = verifyDashboardUnlockToken(unlocked());
    expect(payload?.userId).toBe('trader-1');
    expect(payload?.tokenVersion).toBe(3);
  });

  it('rejects a token whose payload has been edited', () => {
    const [scope, payload, signature] = unlocked().split('.');
    const tampered = Buffer.from(
      JSON.stringify({
        userId: 'someone-else',
        tokenVersion: 3,
        issuedAt: Date.now(),
        scope: 'dashboard-unlock',
      })
    ).toString('base64url');

    // Same signature, different payload: the whole point of signing it.
    expect(verifyDashboardUnlockToken(`${scope}.${tampered}.${signature}`)).toBeNull();
  });

  it('rejects anything that is not a token', () => {
    for (const value of [null, undefined, '', 'x', 42, {}, 'a.b.c']) {
      expect(verifyDashboardUnlockToken(value)).toBeNull();
    }
  });

  it('rejects a token borrowed from another scope', () => {
    // A token signed under the same secret but for a different purpose must
    // not unlock the dashboard - this is what stops one feature's credential
    // becoming another's.
    const [, payload, signature] = unlocked().split('.');
    expect(verifyDashboardUnlockToken(`pinpending.${payload}.${signature}`)).toBeNull();
  });

  it('expires', () => {
    const token = unlocked();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(verifyDashboardUnlockToken(token)).toBeNull();
  });
});

describe('binding to a session', () => {
  it('accepts the session it was minted for', () => {
    expect(unlockMatchesSession(unlocked(), SESSION)).toBe(true);
  });

  it('refuses a token minted for a different account', () => {
    const other = createDashboardUnlockToken('trader-2', 3);
    expect(unlockMatchesSession(other, SESSION)).toBe(false);
  });

  it('refuses a token from before the session was revoked', () => {
    // Signing out, resetting a password and suspending an account all bump
    // tokenVersion. The unlock has to die with the session, or a token held in
    // a still-open tab would outlive the sign-out that was meant to end it.
    const stale = createDashboardUnlockToken('trader-1', 2);
    expect(unlockMatchesSession(stale, SESSION)).toBe(false);
  });

  it('refuses a missing token', () => {
    expect(unlockMatchesSession(null, SESSION)).toBe(false);
  });
});

describe('the endpoint guard', () => {
  it('lets an unlocked request through', () => {
    expect(requireUnlock(requestWith(unlocked()), SESSION)).toBeNull();
  });

  it('blocks a request with a valid session and no unlock', () => {
    const response = requireUnlock(requestWith(), SESSION);
    expect(response?.status).toBe(423);
  });

  it('blocks a request carrying another account unlock', () => {
    const response = requireUnlock(requestWith(createDashboardUnlockToken('trader-2', 3)), SESSION);
    expect(response?.status).toBe(423);
  });

  it('distinguishes signed-out from locked', async () => {
    // 401 means "sign in again"; 423 means "enter your PIN". The dashboard
    // branches on exactly this, so collapsing them would send a locked user
    // back to the sign-in screen they just came from.
    expect(unlockFailureResponse('unauthenticated').status).toBe(401);

    const locked = unlockFailureResponse('locked');
    expect(locked.status).toBe(423);
    await expect(locked.json()).resolves.toMatchObject({ code: 'pin_required' });
  });

  it('never leaks the PIN or the token in the refusal', async () => {
    const body = await unlockFailureResponse('locked').text();
    expect(body).not.toContain('dashboard-unlock');
    expect(body).not.toMatch(/\d{6}/);
  });
});
