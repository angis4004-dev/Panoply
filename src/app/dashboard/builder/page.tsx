'use client';

import PortfolioBuilderTab from '@/components/dashboard/portfolio-builder-tab';
import { PageHeader } from '@/components/dashboard/page-header';

export default function BuilderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Builder"
        description="Input holdings and goals — we'll generate a report and email it to you."
      />
      <PortfolioBuilderTab />
    </div>
  );
}
