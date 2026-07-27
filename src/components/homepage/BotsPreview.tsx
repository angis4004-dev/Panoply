'use client';

import { Bot, Lock } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

const previewBots = [
  { name: 'WBTC Grid', strategy: 'Grid', successRate: '78%', status: 'Running' },
  { name: 'ETH Monthly DCA', strategy: 'DCA', successRate: '84%', status: 'Active' },
  { name: 'SOL Momentum', strategy: 'Momentum', successRate: '61%', status: 'Paused' },
];

function SignInBadge() {
  return (
    <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-[#1E63FF]/25 bg-[#0A0E13]/80 px-2.5 py-1 backdrop-blur-sm">
      <Lock className="h-3 w-3 text-[#1E63FF]" />
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#1E63FF]">
        Sign in to activate
      </span>
    </div>
  );
}

export function BotsPreview() {
  return (
    <section id="bots" className="py-20 border-t border-[#212A35]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#1E63FF] mb-3">
            Live preview
          </p>
          <h2 className="text-3xl font-bold text-white mb-4">
            Trading bots and market data, ready when you are
          </h2>
          <p className="text-[#8B95A5] leading-relaxed">
            Browse the bot library and market charts below — sign in to deploy a bot, customize
            parameters, or track your own portfolio&apos;s P&amp;L.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Bot cards */}
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-3">
            {previewBots.map((bot, i) => (
              <Reveal key={bot.name} delay={i * 80}>
                <div className="relative h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-5 select-none transition-all duration-300 hover:-translate-y-1 hover:border-[#1E63FF]/30">
                  <SignInBadge />
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1E63FF]/10 mb-4">
                    <Bot className="h-4 w-4 text-[#1E63FF]" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">{bot.name}</h3>
                  <p className="text-xs text-[#8B95A5] mb-4">{bot.strategy} strategy</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8B95A5]">Success rate</span>
                    <span className="font-mono font-semibold text-[#4ADE80]">
                      {bot.successRate}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
                    <span className="text-[10px] uppercase tracking-wider text-[#8B95A5]">
                      {bot.status}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Market chart teaser */}
          <Reveal delay={240}>
            <div className="relative h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#1E63FF]/30">
              <SignInBadge />
              <p className="text-xs font-mono uppercase tracking-wider text-[#8B95A5] mb-1">
                Market · BTC/ETH
              </p>
              <div className="mt-4 flex items-end gap-1.5 h-[140px]">
                {[40, 55, 48, 62, 58, 70, 65, 78, 72, 85, 80, 92].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-[#1E63FF]/60 to-[#1E63FF]/10"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <p className="mt-4 text-[10px] uppercase tracking-wider text-[#4b5563]">
                Switch pairs and view live data after signing in
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
