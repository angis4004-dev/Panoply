'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

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
  const shouldReduceMotion = useReducedMotion();

  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayScore(clampedScore);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * clampedScore));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clampedScore, shouldReduceMotion]);

  const isHighScore = clampedScore >= 70;

  return (
    <div className="flex items-center gap-3">
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
            stroke="#212A35"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="#1E63FF"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: targetOffset }}
            transition={
              shouldReduceMotion ? { duration: 0 } : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
            }
          />
        </svg>
      </div>
      <div>
        <p
          className={
            size === 'lg' ? 'text-2xl font-bold text-white' : 'text-lg font-bold text-white'
          }
        >
          {displayScore}
          <span className="text-sm font-normal text-[#8B95A5]">/100</span>
        </p>
        <p className="text-xs text-[#8B95A5]">Identity Score</p>
      </div>
    </div>
  );
}
