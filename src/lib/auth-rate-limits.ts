import { NextResponse } from 'next/server';
import { formatRetryAfter } from '@/lib/rate-limit';

/**
 * Limits for the account-recovery endpoints.
 *
 * Sign-in has had a limiter since the beginning; the four endpoints that
 * recover an account had none. Between them they will send mail to any address
 * you name and accept an unlimited number of guesses at a reset token, and
 * neither costs the caller anything.
 *
 * ## The two shapes of abuse, which want different limits
 *
 * **Requesting** (forgot-password, pin/forgot) spends something real on every
 * call: an email to somebody who did not ask for it, and a slice of the Resend
 * quota the whole product shares. Nobody legitimately needs a fourth reset
 * link within the hour - the first one is still valid - so the limit is tight,
 * and the meaningful key is the recipient rather than the caller. An attacker
 * rotates IPs freely; what they cannot rotate is the address they are trying
 * to bury.
 *
 * **Redeeming** (reset-password, pin/reset) spends nothing, but every call is
 * a guess at a token that, if hit, hands over the account. The tokens are 32
 * random bytes and are not going to be guessed, so this limit is not really
 * what stands between an attacker and the account - it is what makes the
 * attempt visible and bounded rather than free and silent, and what keeps a
 * future shortening of a token from being catastrophic. A legitimate person
 * arrives here by clicking a link and gets it right the first time, so the
 * counter only ever advances on a failure.
 *
 * ## Why per-IP is still worth having
 *
 * `x-forwarded-for` is client-controlled, so an IP key is not a wall. It is a
 * speed bump that costs an attacker the effort of rotating addresses, and it
 * catches the unsophisticated case - which is most of them.
 *
 * One thing to confirm against the live host rather than assume: if the proxy
 * in front of the app does not set `x-forwarded-for`, `getClientIp` returns
 * the literal string 'unknown' and every caller shares one bucket - at which
 * point ten failed guesses from anybody blocks redemption for everybody for
 * fifteen minutes. `admin-login-ip:` in the admin console has the same
 * exposure and predates this file, so the answer covers both. The `ip` column
 * on an admin audit record is what the application actually saw, and is the
 * cheapest place to read the answer off once real traffic has arrived.
 */

/** Recovery emails one address will accept before we stop sending. */
export const RECOVERY_REQUEST_MAX_PER_RECIPIENT = 3;
/** Recovery emails one client will trigger for any addresses. */
export const RECOVERY_REQUEST_MAX_PER_IP = 10;
export const RECOVERY_REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Failed token redemptions from one client before it is shut out. */
export const RECOVERY_REDEEM_MAX_PER_IP = 10;
export const RECOVERY_REDEEM_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Keys are namespaced per endpoint on purpose.
 *
 * Sharing one bucket across the recovery flow would mean a password reset
 * request eats the budget for a PIN reset, and the two are unrelated problems
 * arriving at different moments. The cost of separate buckets is that an
 * attacker gets each budget rather than one; the cost of a shared bucket is a
 * user locked out of a flow they have not touched.
 */
export const rateLimitKeys = {
  /** Password reset requested for this address, whoever asked. */
  forgotPasswordRecipient: (email: string) => `forgot-password:email:${email.trim().toLowerCase()}`,
  /** Password resets requested by this client, for any address. */
  forgotPasswordIp: (ip: string) => `forgot-password:ip:${ip}`,
  /**
   * PIN reset links requested by this account.
   *
   * Keyed on the user rather than the address because the endpoint is session
   * gated: to reach it you have already passed the password, so there is a
   * known account and no need to guess at who the caller is.
   */
  pinForgotUser: (userId: string) => `pin-forgot:user:${userId}`,
  /** Failed password-reset token redemptions from this client. */
  resetPasswordIp: (ip: string) => `reset-password:ip:${ip}`,
  /** Failed PIN-reset token redemptions from this client. */
  pinResetIp: (ip: string) => `pin-reset:ip:${ip}`,
};

/**
 * The 429.
 *
 * `Retry-After` is set because it is the one part of this a client can act on
 * without parsing prose, and because it is what a well-behaved retry loop
 * looks for before backing off blindly.
 *
 * The message says how long, never how many attempts remain. A countdown
 * ("2 tries left") tells an attacker precisely how hard they may push and
 * exactly when the window reopens.
 */
export function tooManyRequests(message: string, retryAfterMs: number): NextResponse {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    { error: `${message} Try again in ${formatRetryAfter(retryAfterMs)}.` },
    { status: 429, headers: { 'Retry-After': String(seconds) } }
  );
}
