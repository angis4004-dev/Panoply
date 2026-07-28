import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — Aegis',
  description: 'The terms that govern your use of the Aegis platform.',
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" updated="July 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Aegis. By
        creating an account or otherwise using the platform, you agree to be bound by these Terms.
      </p>

      <section>
        <h2>Eligibility</h2>
        <p>
          You must be able to form a legally binding contract to use Aegis. Access may be restricted
          in certain jurisdictions where use of the platform would be unlawful.
        </p>
      </section>

      <section>
        <h2>Account registration and verification</h2>
        <p>
          You are responsible for maintaining the confidentiality of your credentials and for all
          activity under your account. Certain features, including vault deposits and wallet
          allocation, require completing identity verification before they unlock.
        </p>
      </section>

      <section>
        <h2>Non-custodial platform</h2>
        <p>
          Aegis does not take custody of your assets. You retain control of your own wallet and
          private keys at all times. Aegis provides tooling for research, automation configuration,
          and portfolio analytics only.
        </p>
      </section>

      <section>
        <h2>Platform description</h2>
        <p>
          Aegis provides signal flows (automated strategy configurations), vault investment
          tracking, yield opportunity discovery, a portfolio builder, and related analytics. Some
          areas of the platform currently operate in a dry-run capacity, meaning trades and balances
          are simulated rather than executed against live markets. Where this applies, it is
          disclosed in the product itself.
        </p>
      </section>

      <section>
        <h2>Risk acknowledgment</h2>
        <p>
          Digital assets and DeFi protocols carry meaningful risk, including price volatility, smart
          contract risk, and regulatory uncertainty. You are solely responsible for evaluating
          whether any strategy or allocation is appropriate for you. See our{' '}
          <a href="/disclaimer" className="text-primary hover:underline">
            Disclaimer
          </a>{' '}
          for more detail.
        </p>
      </section>

      <section>
        <h2>Prohibited uses</h2>
        <ul>
          <li>Attempting to circumvent identity verification or platform security controls.</li>
          <li>Using the platform for money laundering, fraud, or other unlawful activity.</li>
          <li>
            Interfering with or disrupting the integrity of the platform or its infrastructure.
          </li>
          <li>Reverse engineering or misrepresenting platform functionality to third parties.</li>
        </ul>
      </section>

      <section>
        <h2>Intellectual property</h2>
        <p>
          The Aegis name, branding, and platform software are the property of Aegis and its
          licensors. Nothing in these Terms grants you rights to our intellectual property beyond
          what is necessary to use the platform as intended.
        </p>
      </section>

      <section>
        <h2>Termination</h2>
        <p>
          We may suspend or terminate access to the platform for violation of these Terms, security
          concerns, or as required by law. You may stop using the platform at any time.
        </p>
      </section>

      <section>
        <h2>Disclaimers and limitation of liability</h2>
        <p>
          The platform is provided &quot;as is&quot; without warranties of any kind. To the maximum
          extent permitted by law, Aegis is not liable for indirect, incidental, or consequential
          damages arising from your use of the platform.
        </p>
      </section>

      <section>
        <h2>Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. Continued use of the platform after changes
          take effect constitutes acceptance of the revised Terms.
        </p>
      </section>
    </LegalPageLayout>
  );
}
