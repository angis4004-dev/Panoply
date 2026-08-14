'use client';

import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

interface IdentityScoreProps {
  score: number;
  size?: 'sm' | 'lg';
}

export function IdentityScore({ score, size = 'lg' }: IdentityScoreProps) {
  const dimension = size === 'lg' ? 96 : 56;
  const strokeWidth = size === 'lg' ? 8 : 5;
  const radius = (dimension - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const targetOffset = circumference - (clampedScore / 100) * circumference;

  const [displayScore, setDisplayScore] = useState(0);
  const circleRef = useRef<SVGCircleElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (circleRef.current) {
          gsap.fromTo(
            circleRef.current,
            { strokeDashoffset: circumference },
            { strokeDashoffset: targetOffset, duration: 0.9, ease: 'power3.out' }
          );
        }
        const counter = { value: 0 };
        gsap.to(counter, {
          value: clampedScore,
          duration: 0.9,
          ease: 'power3.out',
          onUpdate: () => setDisplayScore(Math.round(counter.value)),
        });
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        if (circleRef.current) {
          gsap.set(circleRef.current, { strokeDashoffset: targetOffset });
        }
        setDisplayScore(clampedScore);
      });

      return () => mm.revert();
    },
    { dependencies: [clampedScore, targetOffset, circumference], scope: containerRef }
  );

  const isHighScore = clampedScore >= 70;

  return (
    <div ref={containerRef} className="flex items-center gap-3">
      <div className="relative">
        {isHighScore && (
          <div className="absolute inset-0 -z-10 rounded-full bg-primary/25 blur-lg" />
        )}
        <svg width={dimension} height={dimension} className="-rotate-90">
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            className="stroke-ds-border"
            strokeWidth={strokeWidth}
          />
          {/* Brand cream, not the blue that was here.

              This is the second progress ring on the overview - the Panoply
              risk score has one too - and that one already draws its arc in
              the brand accent. Two rings measuring progress toward a goal,
              side by side, in two unrelated accent colours read as two
              different systems. The blue also contradicted this component's
              own high-score glow, which is bg-primary/25. */}
          <circle
            ref={circleRef}
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            className="stroke-primary"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <p
          className={
            size === 'lg' ? 'text-2xl font-bold text-ds-text' : 'text-lg font-bold text-ds-text'
          }
        >
          {displayScore}
          <span className="text-sm font-normal text-ds-text-muted">/100</span>
        </p>
        <p className="text-xs text-ds-text-muted">Identity Score</p>
      </div>
    </div>
  );
}
