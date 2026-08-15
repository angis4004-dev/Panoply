'use client';

import PortfolioBuilderTab from '@/components/dashboard/portfolio-builder-tab';

/**
 * No PageHeader here on purpose.
 *
 * PortfolioBuilderTab renders its own "Portfolio Builder" heading, so a
 * PageHeader above it put the same title on screen twice with two different
 * subtitles saying the same thing. The tab owns the title.
 */
export default function BuilderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PortfolioBuilderTab />
    </div>
  );
}
