import { sendEmail } from '@/lib/email';
import { EMAIL_STYLE, escapeHtml, renderEmail } from '@/lib/email-template';
import { SUPPORT_EMAIL } from '@/lib/contact';

/**
 * Emails the team when something happens that a person has to act on.
 *
 * Four events: a sign-up, a KYC submission, a deposit claim and a withdrawal
 * request. The last three each create a pending item that sits in the admin
 * console until an operator deals with it, and until now nothing told anyone
 * it was there - the only way to find out was to go and look.
 *
 * Each alert carries enough to decide what to do and a button to the page
 * where it is done, and nothing more. Identity numbers, dates of birth and
 * documents never go into email; a withdrawal's destination is shortened.
 *
 * `alertOps` is fire-and-forget. Callers do not await it, and it never
 * throws: a mail outage must not turn a successful deposit into an error.
 */

export interface SignupEvent {
  type: 'signup';
  userId: string;
  name: string;
  email: string;
}

export interface KycEvent {
  type: 'kyc';
  userId: string;
  name: string;
  email: string;
  country: string;
  idType: string;
}

export interface DepositEvent {
  type: 'deposit';
  userId: string;
  email: string;
  amount: string;
  coin: string;
  network: string;
  txReference: string;
}

export interface WithdrawalEvent {
  type: 'withdrawal';
  userId: string;
  email: string;
  amountUsd: number;
  coin: string;
  network: string;
  destination: string;
}

export type OpsEvent = SignupEvent | KycEvent | DepositEvent | WithdrawalEvent;

/** First and last six characters: enough to recognise, not enough to reuse. */
export function shortenAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}

/** Absolute link into the admin console, or null when its host is unknown. */
export function adminUrl(path: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const configured =
    env.ADMIN_APP_URL?.trim() || (env.ADMIN_HOST?.trim() ? `https://${env.ADMIN_HOST.trim()}` : '');
  if (!configured) return null;
  const base = /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Subjects are built from text users typed. A line break in a header is how
 * extra headers get injected, so they are flattened here even though the
 * mail API should refuse them - this is the layer that can be tested.
 */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

const usd = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A value that has no spaces to wrap at - a transaction hash, an address.
 *
 * Left in an ordinary paragraph, a 64-character reference cannot break, so it
 * sets the width of the table it sits in and pushes the whole email past the
 * card: 605px inside a 500px phone. `word-break` is what keeps the layout the
 * width of the screen rather than the width of the longest hash.
 */
function unbreakableLine(label: string, value: string): string {
  return `<p style="margin:0 0 16px;font-family:${EMAIL_STYLE.font};font-size:15px;line-height:24px;color:${EMAIL_STYLE.bodyText};">${escapeHtml(label)}<br /><span style="word-break:break-all;color:${EMAIL_STYLE.ink};">${escapeHtml(value)}</span></p>`;
}

function describeEvent(event: OpsEvent): {
  subject: string;
  title: string;
  lines: string[];
  blocks?: string[];
  path: string;
  action: string;
} {
  switch (event.type) {
    case 'signup':
      return {
        subject: `New sign-up: ${event.name}`,
        title: 'New sign-up',
        lines: [`**${event.name}** (${event.email}) just created an account.`],
        path: `/admin/traders/${encodeURIComponent(event.userId)}`,
        action: 'View trader',
      };
    case 'kyc':
      return {
        subject: `KYC submitted: ${event.name}`,
        title: 'Identity verification to review',
        lines: [
          `**${event.name}** (${event.email}) submitted identity verification.`,
          `Country: ${event.country}. Document type: ${event.idType}.`,
          'Their deposits stay locked until this is reviewed.',
        ],
        path: '/admin/kyc',
        action: 'Open the KYC queue',
      };
    case 'deposit':
      return {
        subject: `Deposit submitted: ${event.amount} ${event.coin} on ${event.network}`,
        title: 'Deposit to match and approve',
        lines: [
          `**${event.email}** says they sent **${event.amount} ${event.coin}** on ${event.network}.`,
          'Their balance does not change until it is approved.',
        ],
        blocks: [unbreakableLine('Transaction reference:', event.txReference)],
        path: '/admin/deposits',
        action: 'Open deposits',
      };
    case 'withdrawal':
      return {
        subject: `Withdrawal requested: ${usd(event.amountUsd)}`,
        title: 'Withdrawal to review',
        lines: [
          `**${event.email}** requested **${usd(event.amountUsd)}** in ${event.coin} on ${event.network}.`,
          `Destination: ${shortenAddress(event.destination)}`,
        ],
        path: '/admin/withdrawals',
        action: 'Open withdrawals',
      };
  }
}

export function renderOpsAlert(
  event: OpsEvent,
  env: NodeJS.ProcessEnv = process.env
): { subject: string; html: string } {
  const d = describeEvent(event);
  const url = adminUrl(d.path, env);
  const html = renderEmail({
    eyebrow: 'Operations',
    title: d.title,
    preheader: oneLine(d.lines[0].replace(/\*\*/g, '')),
    paragraphs: url ? d.lines : [...d.lines, `Admin console page: ${d.path}`],
    blocks: d.blocks,
    action: url ? { label: d.action, url } : undefined,
    footnote: 'Sent to the operations inbox because this needs someone to act on it.',
  });
  return { subject: `[Panoply] ${oneLine(d.subject)}`, html };
}

export async function alertOps(event: OpsEvent): Promise<void> {
  try {
    const { subject, html } = renderOpsAlert(event);
    const sent = await sendEmail({
      to: process.env.OPS_ALERT_EMAIL?.trim() || SUPPORT_EMAIL,
      subject,
      html,
    });
    if (!sent) console.error(`Ops alert not delivered: ${subject}`);
  } catch (error) {
    console.error('Ops alert failed:', event.type, error);
  }
}
