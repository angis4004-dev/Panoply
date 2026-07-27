'use client';
import { useEffect, useRef } from 'react';

export function StatsTicker() {
  const styleInsertedRef = useRef(false);

  useEffect(() => {
    if (styleInsertedRef.current) return;
    const style = document.createElement('style');
    style.id = 'stats-ticker-style';
    style.textContent = `
      @keyframes ticker {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
    `;
    document.head.appendChild(style);
    styleInsertedRef.current = true;
    return () => {
      style.remove();
      styleInsertedRef.current = false;
    };
  }, []); // Empty deps: run once on mount, cleanup on unmount

  const stats = [
    { label: 'TVL', value: '$1.2B' },
    { label: 'Users', value: '50K+' },
    { label: 'Trades', value: '2.4M' },
    { label: 'Uptime', value: '99.9%' },
    { label: 'Volume', value: '$850M' },
    { label: 'Active Bots', value: '12,400' },
    { label: 'Chains Supported', value: '6+' },
    { label: 'Strategy Categories', value: '10+' },
  ];

  return (
    <div className="relative h-12 bg-[#0D1219] border-y border-[#212A35] overflow-hidden">
      <div className="relative flex h-full items-center">
        <div className="flex-shrink-0 flex-1 py-2">
          <div className="flex flex-nowrap items-center gap-8 animate-[ticker_30s_linear_infinite]">
            {stats.map((stat, index) => (
              <div key={index} className="whitespace-nowrap">
                <span className="text-xs text-[#8B95A5]">{stat.label}</span>
                <span className="ml-1 text-xs font-mono text-primary">{stat.value}</span>
              </div>
            ))}
            {/* Duplicate for seamless loop */}
            {stats.map((stat, index) => (
              <div key={`-${index}`} className="whitespace-nowrap">
                <span className="text-xs text-[#8B95A5]">{stat.label}</span>
                <span className="ml-1 text-xs font-mono text-primary">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Optional: add a subtle gradient overlay to indicate scroll */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-black/80 to-transparent" />
          <div className="absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-black/80 to-transparent" />
        </div>
      </div>
    </div>
  );
}
