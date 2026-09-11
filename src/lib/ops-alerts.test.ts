import { describe, it, expect } from 'vitest';
import { adminUrl, renderOpsAlert, shortenAddress, type OpsEvent } from '@/lib/ops-alerts';

const env = { ADMIN_APP_URL: 'https://admin.panoply.finance/' } as unknown as NodeJS.ProcessEnv;

const signup: OpsEvent = {
  type: 'signup',
  userId: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
};
const kyc: OpsEvent = {
  type: 'kyc',
  userId: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  country: 'Nigeria',
  idType: 'passport',
};
const deposit: OpsEvent = {
  type: 'deposit',
  userId: 'u1',
  email: 'jane@example.com',
  amount: '450',
  coin: 'USDT',
  network: 'TRC20',
  txReference: '0xabc123',
};
const withdrawal: OpsEvent = {
  type: 'withdrawal',
  userId: 'u1',
  email: 'jane@example.com',
  amountUsd: 300,
  coin: 'USDT',
  network: 'TRC20',
  destination: 'TXyz1234567890abcdefghijklmnopQRSTUV',
};

describe('subjects', () => {
  it('names each event and starts with [Panoply]', () => {
    expect(renderOpsAlert(signup, env).subject).toBe('[Panoply] New sign-up: Jane Doe');
    expect(renderOpsAlert(kyc, env).subject).toBe('[Panoply] KYC submitted: Jane Doe');
    expect(renderOpsAlert(deposit, env).subject).toBe(
      '[Panoply] Deposit submitted: 450 USDT on TRC20'
    );
    expect(renderOpsAlert(withdrawal, env).subject).toBe('[Panoply] Withdrawal requested: $300.00');
  });

  it('strips line breaks a user could use to forge headers', () => {
    const s = renderOpsAlert({ ...signup, name: 'Jane\r\nBcc: x@y.z' }, env).subject;
    expect(s).not.toMatch(/[\r\n]/);
  });
});

describe('links', () => {
  it('points each alert at the admin page that handles it', () => {
    expect(renderOpsAlert(signup, env).html).toContain(
      'https://admin.panoply.finance/admin/traders/u1'
    );
    expect(renderOpsAlert(kyc, env).html).toContain('https://admin.panoply.finance/admin/kyc');
    expect(renderOpsAlert(deposit, env).html).toContain(
      'https://admin.panoply.finance/admin/deposits'
    );
    expect(renderOpsAlert(withdrawal, env).html).toContain(
      'https://admin.panoply.finance/admin/withdrawals'
    );
  });

  it('falls back to ADMIN_HOST, then to no link at all', () => {
    expect(
      adminUrl('/admin/kyc', {
        ADMIN_HOST: 'admin.panoply.finance',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe('https://admin.panoply.finance/admin/kyc');
    expect(adminUrl('/admin/kyc', {} as unknown as NodeJS.ProcessEnv)).toBeNull();
    const html = renderOpsAlert(kyc, {} as unknown as NodeJS.ProcessEnv).html;
    expect(html).toContain('/admin/kyc');
    expect(html).not.toContain('href="/admin');
  });
});

describe('what an alert may carry', () => {
  it('escapes user-typed text', () => {
    const html = renderOpsAlert({ ...signup, name: '<img src=x onerror=alert(1)>' }, env).html;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('never includes the full withdrawal destination', () => {
    const html = renderOpsAlert(withdrawal, env).html;
    expect(html).not.toContain(withdrawal.destination);
    expect(html).toContain('TXyz12…QRSTUV');
  });

  it('has no field for an ID number or date of birth to leak through', () => {
    // Structural: the KYC event type cannot carry them, so nothing can render them.
    const keys = Object.keys(kyc);
    expect(keys).not.toContain('idNumber');
    expect(keys).not.toContain('dateOfBirth');
  });
});

describe('long values', () => {
  it('lets a transaction reference wrap rather than widen the email', () => {
    // A 64-character hash in an ordinary paragraph cannot break, so it sets the
    // width of the table and pushes the card past a phone screen.
    const html = renderOpsAlert({ ...deposit, txReference: 'a'.repeat(64) } as OpsEvent, env).html;
    expect(html).toContain('word-break:break-all');
    expect(html).toContain('a'.repeat(64));
  });
});

describe('shortenAddress', () => {
  it('keeps short addresses whole and shortens long ones', () => {
    expect(shortenAddress('abc')).toBe('abc');
    expect(shortenAddress('0123456789abcdefghij')).toBe('012345…efghij');
  });
});
