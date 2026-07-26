'use client';

import Link from 'next/link';
import { ArrowRight, Bot, Zap, Repeat, RefreshCw } from 'lucide-react';

export default function AutomationSection() {
  return (
    <section className="py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-foreground mb-8 text-center">DeFi Automation</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Trading Bots */}
          <div className="bg-background/30 border-[#212A35]/20 rounded-xl p-6 flex flex-col items-center text-center">
            <Bot className="h-10 w-10 mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Trading Bots</h3>
            <p className="text-sm text-foreground/60">
              Create and deploy automated trading strategies that execute 24/7 based on your
              predefined rules.
            </p>
          </div>

          {/* Automated Strategies */}
          <div className="bg-background/30 border-[#212A35]/20 rounded-xl p-6 flex flex-col items-center text-center">
            <Zap className="h-10 w-10 mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Automated Strategies</h3>
            <p className="text-sm text-foreground/60">
              Let AI continuously optimize your portfolio allocation based on market conditions and
              opportunities.
            </p>
          </div>

          {/* Vault Allocation */}
          <div className="bg-background/30 border-[#212A35]/20 rounded-xl p-6 flex flex-col items-center text-center">
            <Repeat className="h-10 w-10 mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Smart Vault Allocation</h3>
            <p className="text-sm text-foreground/60">
              Automatically distribute your funds across top-performing vaults to maximize yield
              while managing risk.
            </p>
          </div>

          {/* Portfolio Rebalancing */}
          <div className="bg-background/30 border-[#212A35]/20 rounded-xl p-6 flex flex-col items-center text-center">
            <RefreshCw className="h-10 w-10 mb-4 text-primary" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Auto Rebalancing</h3>
            <p className="text-sm text-foreground/60">
              Maintain your target portfolio allocation with automated rebalancing based on your
              risk preferences.
            </p>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/dashboard/builder"
            className="inline-flex items-center px-4 py-2 bg-primary text-[#1A1305] font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Start Building Your Automated Strategy
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
