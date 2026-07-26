'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function YieldVaultSection() {
  return (
    <section className="py-16 bg-background/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
          Top Yield Opportunities
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Aave Vault */}
          <div className="bg-background/30 border border-border/20 rounded-xl p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 h-10 w-10 bg-[#3FBF95]/10 rounded flex items-center justify-center">
                <span className="text-[#3FBF95] font-bold">A</span>
              </div>
              <div className="ml-4">
                <h3 className="font-semibold text-foreground mb-1">Aave</h3>
                <p className="text-sm text-foreground/60">Ethereum • V3 Vault</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">APY</span>
                <span className="font-medium text-[#3FBF95]">5.24%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">TVL</span>
                <span className="font-medium text-foreground">$890M</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Risk</span>
                <span className="px-2 py-0.5 bg-[#3FBF95]/20 text-[#3FBF95] rounded text-xs">Low</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Strategy</span>
                <span className="text-sm text-foreground/60">Lending</span>
              </div>
            </div>
          </div>

          {/* Curve Vault */}
          <div className="bg-background/30 border border-border/20 rounded-xl p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 h-10 w-10 bg-[#5B9BD9]/10 rounded flex items-center justify-center">
                <span className="text-[#5B9BD9] font-bold">C</span>
              </div>
              <div className="ml-4">
                <h3 className="font-semibold text-foreground mb-1">Curve</h3>
                <p className="text-sm text-foreground/60">Ethereum • 3Pool LP</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">APY</span>
                <span className="font-medium text-[#5B9BD9]">8.12%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">TVL</span>
                <span className="font-medium text-foreground">$1.2B</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Risk</span>
                <span className="px-2 py-0.5 bg-[#5B9BD9]/20 text-[#5B9BD9] rounded text-xs">Medium</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Strategy</span>
                <span className="text-sm text-foreground/60">Liquidity Provision</span>
              </div>
            </div>
          </div>

          {/* Lyra Vault */}
          <div className="bg-background/30 border border-border/20 rounded-xl p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 h-10 w-10 bg-[#E5555A]/10 rounded flex items-center justify-center">
                <span className="text-[#E5555A] font-bold">L</span>
              </div>
              <div className="ml-4">
                <h3 className="font-semibold text-foreground mb-1">Lyra</h3>
                <p className="text-sm text-foreground/60">Ethereum • Options MM</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">APY</span>
                <span className="font-medium text-[#E5555A]">12.4%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">TVL</span>
                <span className="font-medium text-foreground">$210M</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Risk</span>
                <span className="px-2 py-0.5 bg-[#E5555A]/20 text-[#E5555A] rounded text-xs">High</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/60">Strategy</span>
                <span className="text-sm text-foreground/60">Options Market Making</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link href="/dashboard/vaults" className="inline-flex items-center px-4 py-2 bg-primary text-[#1A1305] font-medium rounded-lg hover:bg-primary/90 transition-colors">
            Explore All Vaults
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}