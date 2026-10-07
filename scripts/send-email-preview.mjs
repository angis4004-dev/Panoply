#!/usr/bin/env node
/**
 * Sends an HTML file as an email, through the app's own sendEmail.
 *
 * For checking a message in a real inbox before it goes to the person it was
 * written for. Rendering it in a browser proves nothing about what Gmail or
 * Outlook will do with it: both rewrite the markup on the way in, and the
 * things they break - head styles, remote images, the button - are exactly
 * the things a browser gets right.
 *
 *   node scripts/send-email-preview.mjs --to you@example.com \
 *     --subject "Your Panoply account is ready" --html ./message.html
 *
 *   ... --send        actually send it
 *
 * Dry run by default: it resolves everything, reports what would go out, and
 * stops. --send is the only thing that puts a message in someone's inbox.
 *
 * It goes through src/lib/email.ts rather than calling Resend directly, so
 * the preview carries the same From, the same Reply-To and the same inline
 * logo attachment as the real thing. A preview sent down a different path is
 * a test of the wrong path.
 *
 * --no-logo for a message that does not reference cid:panoply-mark, so it
 * does not arrive with a paperclip and nothing attached.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp, loadEnv } from './lib/load-app.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const LOGO_CID = 'cid:panoply-mark';

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    send: argv.includes('--send'),
    noLogo: argv.includes('--no-logo'),
    to: flag('to', null),
    subject: flag('subject', null),
    html: flag('html', null),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.to || !args.subject || !args.html) {
    throw new Error(
      'Usage: node scripts/send-email-preview.mjs --to <address> --subject "<subject>" ' +
        '--html <file> [--no-logo] [--send]'
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.to)) {
    throw new Error(`Not an email address: ${args.to}`);
  }

  const htmlPath = resolve(args.html);
  const html = readFileSync(htmlPath, 'utf8');
  const referencesLogo = html.includes(LOGO_CID);

  loadEnv(ROOT, readFileSync);
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required.');

  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  console.info(`from          ${from}`);
  console.info(`reply-to      ${process.env.EMAIL_REPLY_TO || 'support@panoply.finance'}`);
  console.info(`to            ${args.to}`);
  console.info(`subject       ${args.subject}`);
  console.info(`html          ${htmlPath} (${html.length} bytes)`);
  console.info(
    `logo          ${args.noLogo ? 'not attached (--no-logo)' : 'attached as ' + LOGO_CID}`
  );

  /*
   * Said rather than prevented. Both of these produce a message that looks
   * fine from here and wrong in the inbox, and neither is this script's
   * business to refuse - but neither should be discovered by a recipient.
   */
  if (!args.noLogo && !referencesLogo) {
    console.info(`\nWarning: the markup never references ${LOGO_CID}, so this will arrive`);
    console.info('with an attachment nothing displays - a paperclip on an email that has');
    console.info('nothing attached. Pass --no-logo, or reference the cid in the markup.');
  }
  if (args.noLogo && referencesLogo) {
    console.info(`\nWarning: the markup references ${LOGO_CID} but --no-logo was passed,`);
    console.info('so the masthead will render as a broken image.');
  }
  if (from.endsWith('@resend.dev')) {
    console.info("\nWarning: EMAIL_FROM is Resend's shared sandbox address. It delivers only");
    console.info('to the address that owns the Resend account; everything else is rejected.');
    console.info('Mail branded Panoply arriving from resend.dev also reads as spoofed.');
    console.info('Set EMAIL_FROM to an address on a domain verified in Resend.');
  }

  if (!args.send) {
    console.info('\nDry run. Nothing was sent. Re-run with --send.');
    return;
  }

  const { app, cleanup } = await loadApp(ROOT, { '@/lib/email': ['sendEmail'] });
  try {
    const ok = await app.sendEmail({
      to: args.to,
      subject: args.subject,
      html,
      withoutLogo: args.noLogo,
    });
    console.info(`\n${ok ? 'Accepted by Resend.' : 'Rejected. The error is logged above.'}`);
    if (!ok) process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
});
