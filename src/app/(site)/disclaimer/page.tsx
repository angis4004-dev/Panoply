import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';
import { OperatingEntities } from '@/components/legal/OperatingEntities';

export const metadata: Metadata = {
  title: 'Disclaimer | Panoply',
  description: 'Important risk and informational disclosures about the Panoply platform.',
};

export default function DisclaimerPage() {
  return (
    <LegalPageLayout title="Disclaimer" updated="July 2026">
      <section>
        <h2>Not financial advice</h2>
        <p>
          Nothing on Panoply constitutes financial, investment, legal, or tax advice. Signal flow
          configurations, vault listings, yield data, and portfolio reports are informational tools,
          not personalized recommendations. Consult a qualified professional before making financial
          decisions.
        </p>
      </section>

      <section>
        <h2>No guarantee of results</h2>
        <p>
          Historical performance, projected APY, and risk scores shown on the platform are not
          guarantees of future results. Quantitative models are simplifications of market behavior
          and can be wrong.
        </p>
      </section>

      <section>
        <h2>Trading mode</h2>
        <p>
          Signal flow performance is derived from orders placed on a connected exchange and the
          fills returned for them. Profit and loss figures are calculated from those fills, not
          modelled or projected.
        </p>
        <p>
          Panoply can be operated in a paper trading mode, in which orders are evaluated against
          live market prices but are not sent to an exchange. Where an account is running in that
          mode it is stated in the product interface, and figures shown for it do not reflect
          executed trades.
        </p>
        <p>
          Realized profit and loss is booked to your wallet when a position closes. Unrealized
          profit and loss reflects the current market value of an open position, changes with the
          market, and is not payable until the position is closed.
        </p>
      </section>

      <section>
        <h2>Market and technology risk</h2>
        <p>
          Digital assets are volatile and can lose significant value. DeFi protocols carry smart
          contract risk, including the possibility of bugs or exploits outside Panoply&apos;
          control. Blockchain networks can experience congestion, forks, or other disruptions that
          affect transaction execution.
        </p>
      </section>

      <section>
        <h2>Regulatory risk</h2>
        <p>
          The regulatory treatment of digital assets and DeFi varies by jurisdiction and continues
          to evolve. Changes in law or enforcement could affect the availability or operation of the
          platform.
        </p>
      </section>

      <section>
        <h2>Third-party data</h2>
        <p>
          Market data displayed on the platform is sourced from third-party providers. Panoply does
          not independently verify the accuracy of this data and is not responsible for errors or
          delays in third-party sources.
        </p>
      </section>

      <section>
        <h2>No fiduciary relationship</h2>
        <p>
          Use of Panoply does not create a fiduciary, advisory, or brokerage relationship between
          you and Panoply. You remain solely responsible for your own decisions and outcomes.
        </p>
      </section>

      {/* Last here rather than first, unlike Terms and Privacy: this page
          exists to lead with the risk warnings, and the entity detail is
          reference the reader comes back for. */}
      <OperatingEntities />
    </LegalPageLayout>
  );
}
