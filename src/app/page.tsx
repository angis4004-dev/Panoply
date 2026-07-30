'use client';

import dynamic from 'next/dynamic';
import { Navbar } from '@/components/homepage/navbar';
import { DeployEngineHero } from '@/components/homepage/deploy-engine/DeployEngineHero';
import { StatsTicker } from '@/components/homepage/StatsTicker';
import { SecuritySection } from '@/components/homepage/SecuritySection';
import { FeaturesGrid } from '@/components/homepage/FeaturesGrid';
import { BotsPreview } from '@/components/homepage/BotsPreview';
import { HowItWorks } from '@/components/homepage/HowItWorks';
import { PricingSection } from '@/components/homepage/PricingSection';
import { Community } from '@/components/homepage/Community';
import { FinalCta } from '@/components/homepage/FinalCta';
import { Footer } from '@/components/homepage/Footer';

const SplashCursor = dynamic(() => import('@/components/ui/SplashCursor'), { ssr: false });

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0A0E13] text-[#E7ECF2] antialiased">
      <SplashCursor
        SIM_RESOLUTION={128}
        DYE_RESOLUTION={1440}
        DENSITY_DISSIPATION={3.5}
        VELOCITY_DISSIPATION={2}
        PRESSURE={0.1}
        CURL={3}
        SPLAT_RADIUS={0.2}
        SPLAT_FORCE={6000}
        COLOR_UPDATE_SPEED={10}
      />
      <Navbar />
      <DeployEngineHero />
      <StatsTicker />
      <SecuritySection />
      <FeaturesGrid />
      <BotsPreview />
      <HowItWorks />
      <PricingSection />
      <Community />
      <FinalCta />
      <Footer />
    </main>
  );
}
