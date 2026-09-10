import { NextResponse } from 'next/server';
import { resetPassword } from '@/lib/auth-store';
import { parseBody, resetPasswordSchema } from '@/lib/validation';
import { checkLimit, consumeAttempt, getClientIp } from '@/lib/rate-limit';
import {
  RECOVERY_REDEEM_MAX_PER_IP,
  RECOVERY_REDEEM_WINDOW_MS,
  rateLimitKeys,
  tooManyRequests,
} from '@/lib/auth-rate-limits';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, resetPasswordSchema);
    if (invalid) return invalid;

    /*
     * Checked before the token is looked up, consumed only when the lookup
     * fails.
     *
     * Someone arriving from their own email clicks once and gets it right, so
     * a successful reset never advances the counter and a person who has
     * genuinely lost access is never held up by other people's traffic. Every
     * failure here, by contrast, is a guess at a 32-byte token, and guesses
     * are the only thing this needs to slow down.
     *
     * `whenUnavailable: 'deny'` for the same reason sign-in uses it: the very
     * next line needs the database anyway, so a caller refused during an
     * outage lost nothing they could have had, while a caller waved through
     * during one would be getting unmetered attempts at the token.
     */
    const key = rateLimitKeys.resetPasswordIp(getClientIp(request));
    const limit = await checkLimit(key, RECOVERY_REDEEM_MAX_PER_IP, RECOVERY_REDEEM_WINDOW_MS, {
      whenUnavailable: 'deny',
    });
    if (limit.limited) {
      return tooManyRequests('Too many failed reset attempts.', limit.retryAfterMs);
    }

    try {
      await resetPassword(body.token, body.password);
    } catch (err) {
      await consumeAttempt(key, RECOVERY_REDEEM_MAX_PER_IP, RECOVERY_REDEEM_WINDOW_MS);
      throw err;
    }

    return NextResponse.json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reset password.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
