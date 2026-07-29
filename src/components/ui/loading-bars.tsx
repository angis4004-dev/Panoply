'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

const BAR_COLORS = ['#1E63FF', '#3D8BFF', '#00D4FF', '#5EEAD4', '#00C896', '#7B61FF', '#1E63FF'];

export default function LoadingBars({ className = '' }: { className?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Only animates when the user hasn't asked for reduced motion; bars
      // simply stay at full height (their default) otherwise.
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const bars = gsap.utils.toArray<HTMLElement>('.loading-bar');
        bars.forEach((bar, i) => {
          gsap.fromTo(
            bar,
            { scaleY: 0.25 },
            {
              scaleY: 1,
              duration: 0.55,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
              delay: i * 0.09,
            }
          );
        });
      });

      return () => mm.revert();
    },
    { scope: container }
  );

  return (
    <div
      ref={container}
      className={`flex h-10 items-end gap-2 ${className}`}
      role="status"
      aria-label="Loading"
    >
      {BAR_COLORS.map((color, i) => (
        <span
          key={i}
          className="loading-bar w-2.5 rounded-full"
          style={{ backgroundColor: color, height: '100%', transformOrigin: 'bottom' }}
        />
      ))}
    </div>
  );
}
