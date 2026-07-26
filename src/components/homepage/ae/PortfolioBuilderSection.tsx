'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function PortfolioBuilderSection() {
  return (
    <section className="py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          Build Your Ideal Portfolio
        </h2>
        <p className="text-center text-white/60 mb-8 max-w-2xl mx-auto">
          Let AI help you create a diversified portfolio based on your risk tolerance, 
          investment goals, and preferred assets.
        </p>
        <div className="bg-black/30 border border-white/10 rounded-xl p-8">
          <div className="space-y-6">
            {/* Portfolio Allocation Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">Asset Allocation</span>
                <span className="text-sm text-white/60">Based on Moderate Risk Profile</span>
              </div>
              <div className="space-y-3">
                {/* Ethereum */}
                <div className="flex justify-between">
                  <span className="flex items-center space-x-2">
                    <div className="h-3 w-3 bg-cyan-400 rounded"></div>
                    <span className="text-sm">Ethereum</span>
                  </span>
                  <span className="text-sm font-medium text-white">40%</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full mb-2">
                  <div className="bg-cyan-400 h-1 rounded-full w-[40%]" />
                </div>
                {/* Solana */}
                <div className="flex justify-between">
                  <span className="flex items-center space-x-2">
                    <div className="h-3 w-3 bg-purple-400 rounded"></div>
                    <span className="text-sm">Solana</span>
                  </span>
                  <span className="text-sm font-medium text-white">25%</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full mb-2">
                  <div className="bg-purple-400 h-1 rounded-full w-[25%]" />
                </div>
                {/* Polygon */}
                <div className="flex justify-between">
                  <span className="flex items-center space-x-2">
                    <div className="h-3 w-3 bg-green-400 rounded"></div>
                    <span className="text-sm">Polygon</span>
                  </span>
                  <span className="text-sm font-medium text-white">15%</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full mb-2">
                  <div className="bg-green-400 h-1 rounded-full w-[15%]" />
                </div>
                {/* Stablecoins */}
                <div className="flex justify-between">
                  <span className="flex items-center space-x-2">
                    <div className="h-3 w-3 bg-yellow-400 rounded"></div>
                    <span className="text-sm">Stablecoins</span>
                  </span>
                  <span className="text-sm font-medium text-white">20%</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full">
                  <div className="bg-yellow-400 h-1 rounded-full w-[20%]" />
                </div>
              </div>
            </div>
            
            {/* Portfolio Metrics */}
            <div className="grid grid-cols-1 gap-4 pt-6 border-t border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Expected APY</span>
                <span className="font-medium text-cyan-400">8.7%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Diversification Score</span>
                <span className="font-medium text-cyan-400">82/100</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Risk Level</span>
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">Moderate</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <Link href="/dashboard/builder" className="inline-flex items-center px-4 py-2 bg-cyan-400 text-black font-medium rounded-lg hover:bg-cyan-400/90 transition-colors">
            Create Your Portfolio
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
