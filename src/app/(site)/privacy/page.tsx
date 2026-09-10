import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';
import { OperatingEntities } from '@/components/legal/OperatingEntities';
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Privacy Policy | Panoply',
  description: 'How Panoply collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="July 2026">
      <p>
        This Privacy Policy describes how Panoply (&quot;Panoply&quot;, &quot;we&quot;,
        &quot;us&quot;) collects, uses, and safeguards information when you use our platform.
        Panoply is non-custodial: we never take control of your assets, but we do process certain
        account and verification data to operate the service and meet compliance obligations.
      </p>

      {/* Placed before the collection detail: a reader cannot evaluate what is
          done with their data without knowing which company is doing it. */}
      <OperatingEntities />

      <section>
        <h2>Information we collect</h2>
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information</strong> — name, email address, and password hash when you
            register.
          </li>
          <li>
            <strong>Identity verification data</strong> — full legal name, date of birth, country of
            residence, ID type and number, and document metadata submitted during identity
            verification.
          </li>
          <li>
            <strong>Platform activity</strong> — signal flow configurations, vault deposits, wallet
            balance, and portfolio reports you generate.
          </li>
          <li>
            <strong>Wallet address</strong> — if you connect or provide one, used for display and
            association with your account only.
          </li>
          <li>
            <strong>Usage data</strong> — session information and basic diagnostic logs used to keep
            the platform secure and reliable.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use your information</h2>
        <ul>
          <li>To create and secure your account, and authenticate sign-ins.</li>
          <li>To review and process identity verification submissions.</li>
          <li>To operate platform features you use, such as signal flows, vaults, and reports.</li>
          <li>To send transactional communications, such as report delivery and account alerts.</li>
          <li>To detect, investigate, and prevent fraud, abuse, and security incidents.</li>
          <li>To comply with applicable legal and regulatory obligations.</li>
        </ul>
      </section>

      <section>
        <h2>Data sharing</h2>
        <p>
          We do not sell your personal information. We share data only with service providers that
          support platform operation (such as infrastructure and email delivery), under
          confidentiality obligations, or when required by law.
        </p>
      </section>

      <section>
        <h2>Data security</h2>
        <p>
          Passwords are stored as salted, one-way hashes. Session cookies are signed and transmitted
          over encrypted connections. Identity verification data is restricted to authorized review
          personnel. No method of transmission or storage is completely secure, and we cannot
          guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>
          We retain account and verification data for as long as your account is active and for a
          reasonable period afterward to meet legal, security, and audit requirements.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have the right to access, correct, or request
          deletion of your personal information. Contact us using the details below to exercise
          these rights.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use a small number of essential cookies to maintain your signed-in session. We do not
          use third-party advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected by
          updating the date at the top of this page.
        </p>
      </section>

      {/*
        This section used to say questions "can be directed to your account
        administrator or support contact within the platform", which is not a
        contact detail - it is a description of one. The section above grants
        rights of access, correction and deletion and tells the reader to
        "contact us using the details below"; the details below were not
        there. A policy that grants a right and withholds the means of
        exercising it is unenforceable by the person it was written for.
      */}
      <section>
        <h2>Contact</h2>
        <p>
          To exercise any of the rights above, or to ask how your data is handled, write to{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Anything else about your account
          goes to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or through Ask Panoply
          once you are signed in.
        </p>
      </section>
    </LegalPageLayout>
  );
}
