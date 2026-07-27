'use client';

import { useState } from 'react';
import { Brain, Send, User } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';

const suggestions = [
  'How can I improve yield without increasing risk?',
  'Should I rebalance my ETH allocation?',
  'What bots fit a moderate risk profile?',
];

export default function AIPage() {
  const [input, setInput] = useState('');

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="AI Command Center"
        description="Natural-language portfolio analysis and strategy recommendations."
      />

      <div className="mx-auto max-w-3xl">
        <div className="mb-6 space-y-4 rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#17202e]">
              <User className="h-4 w-4 text-[#8B95A5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#8B95A5]">You</p>
              <p className="text-sm text-[#E7ECF2]">
                How can I improve my portfolio yield without significantly increasing risk?
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-primary">Aegis AI</p>
              <p className="text-sm leading-relaxed text-[#E7ECF2]">
                I found 3 opportunities that may improve estimated yield while maintaining your
                current risk profile — Aave USDC (5.2%), Curve 3Pool (8.1%), and a low-volatility
                grid bot on WBTC. Want a detailed breakdown?
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="rounded-full border border-[#212A35] px-3 py-1.5 text-xs text-[#8B95A5] hover:border-primary/40 hover:text-[#E7ECF2] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-2 rounded-xl border border-[#212A35] bg-[#122131]/50 p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your portfolio, bots, or yield..."
            className="flex-1 bg-transparent px-3 py-2 text-sm text-[#E7ECF2] placeholder:text-[#8B95A5] outline-none"
          />
          <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[#F2F5FA] hover:bg-[#3D77FF] transition-colors">
            <Send className="h-4 w-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
