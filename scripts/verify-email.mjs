/**
 * Preflight for outbound email.
 *
 * Three flows depend on mail actually leaving the building - address
 * verification at sign-up, password reset, and PIN recovery - and two of them
 * fail silently when it does not. /api/auth/forgot-password ignores the send
 * result on purpose, because reporting it would reveal which addresses have
 * accounts, and registration only logs to the server console. So a
 * misconfiguration here does not look like an outage: password reset appears
 * to work and the mail simply never arrives.
 *
 * This turns that into something you find out about deliberately.
 *
 *   node scripts/verify-email.mjs                    # config only, no send
 *   node scripts/verify-email.mjs --to you@your.com  # also sends one real email
 *
 * No dev server needed; it reads .env and talks to Resend directly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return false;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return true;
}

let failures = 0;
let warnings = 0;

const pass = (label, detail) => console.info(`  PASS  ${label}${detail ? ` - ${detail}` : ''}`);
const warn = (label, detail) => {
  warnings++;
  console.info(`  WARN  ${label}${detail ? ` - ${detail}` : ''}`);
};
const fail = (label, detail) => {
  failures++;
  console.info(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};

/** Recipient for the optional live send: `--to addr` or `--to=addr`. */
function recipientFromArgv() {
  const i = process.argv.indexOf('--to');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.argv.find((a) => a.startsWith('--to='))?.slice(5) ?? null;
}

async function main() {
  const hasEnvFile = loadEnv();
  console.info('\n=== EMAIL CONFIGURATION ===');
  if (!hasEnvFile) warn('.env not found', 'reading process environment only');

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // --- API key ----------------------------------------------------------
  if (!key) {
    fail('RESEND_API_KEY missing', 'every email silently returns false');
  } else if (!key.startsWith('re_')) {
    warn('RESEND_API_KEY does not start with re_', 'may not be a Resend key');
  } else {
    pass('RESEND_API_KEY present', `${key.slice(0, 6)}… (${key.length} chars)`);
  }

  // --- Sender -----------------------------------------------------------
  // The one that actually bites. src/lib/email.ts falls back to
  // onboarding@resend.dev when EMAIL_FROM is unset, which keeps a missing
  // value from becoming a crash - but Resend restricts that shared sender to
  // the address owning the account, so in production it reaches nobody.
  if (!from) {
    fail('EMAIL_FROM not set', 'falls back to onboarding@resend.dev, which only reaches you');
  } else if (/@resend\.dev$/i.test(from)) {
    fail(
      `EMAIL_FROM is ${from}`,
      'Resend sandbox sender: delivers ONLY to the address that owns your Resend account. ' +
        'Verify a domain at resend.com/domains and use an address on it.'
    );
  } else {
    pass('EMAIL_FROM is on a custom domain', from);
  }

  // --- Link base --------------------------------------------------------
  // Every emailed link is built from this, so a localhost value means the mail
  // arrives and the link inside it is dead for the recipient.
  if (!appUrl) {
    warn('NEXT_PUBLIC_APP_URL not set', 'links fall back to http://localhost:4028');
  } else if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    warn(`NEXT_PUBLIC_APP_URL is ${appUrl}`, 'emailed links will point at localhost');
  } else if (!appUrl.startsWith('https://')) {
    warn(`NEXT_PUBLIC_APP_URL is ${appUrl}`, 'not https');
  } else {
    pass('NEXT_PUBLIC_APP_URL looks deployable', appUrl);
  }

  // --- Optional live send -----------------------------------------------
  const to = recipientFromArgv();
  if (!to) {
    console.info('\n  (no --to given, so nothing was sent)');
  } else if (!key) {
    fail('cannot send', 'no API key');
  } else {
    console.info(`\n=== LIVE SEND TO ${to} ===`);
    const sender = from || 'onboarding@resend.dev';
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: sender,
          to: [to],
          subject: 'Aegis email preflight',
          html: '<p>If you are reading this, outbound email works.</p>',
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        pass('Resend accepted the message', `id ${body.id ?? 'unknown'}`);
        console.info('        Delivery is not the same as acceptance - check the inbox.');
      } else {
        fail(
          `Resend rejected the message (${response.status})`,
          body.message || JSON.stringify(body)
        );
        if (/testing email address|domain is not verified/i.test(body.message || '')) {
          console.info(
            '        This is the sandbox restriction: either verify a domain, or send\n' +
              '        to the address that owns the Resend account.'
          );
        }
      }
    } catch (error) {
      fail('could not reach the Resend API', error.message);
    }
  }

  console.info('');
  if (failures > 0) {
    console.info(`FAIL - ${failures} problem${failures === 1 ? '' : 's'}, ${warnings} warning(s)`);
    console.info('Password reset and PIN recovery will not reach real users.\n');
    process.exit(1);
  }
  console.info(`PASS - configuration usable, ${warnings} warning(s)\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
