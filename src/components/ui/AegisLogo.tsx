import React from 'react';

interface AegisMarkProps {
  size?: number;
  className?: string;
}

/**
 * Aegis brand mark: a crown/shield silhouette formed by two outward-curving
 * wings and a central spike, with a small diamond sparkle accent.
 */
export function AegisMark({ size = 32, className = '' }: AegisMarkProps) {
  const gradientId = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="10"
          y1="90"
          x2="90"
          y2="10"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1E63FF" />
          <stop offset="50%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#7B61FF" />
        </linearGradient>
      </defs>
      {/* Left wing */}
      <path
        d="M50 38 C38 30 24 32 12 46 C10 62 16 78 28 88 C26 72 30 56 42 44 Z"
        fill={`url(#${gradientId})`}
      />
      {/* Right wing */}
      <path
        d="M50 38 C62 30 76 32 88 46 C90 62 84 78 72 88 C74 72 70 56 58 44 Z"
        fill={`url(#${gradientId})`}
      />
      {/* Center spike */}
      <path d="M50 12 L64 58 L50 72 L36 58 Z" fill={`url(#${gradientId})`} />
      {/* Sparkle accent */}
      <path
        d="M50 20 L52.5 27.5 L60 30 L52.5 32.5 L50 40 L47.5 32.5 L40 30 L47.5 27.5 Z"
        fill="#F2F5FA"
      />
    </svg>
  );
}

interface AegisLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

export default function AegisLogo({
  size = 32,
  showWordmark = true,
  className = '',
  wordmarkClassName = '',
}: AegisLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <AegisMark size={size} />
      {showWordmark && (
        <span className={`font-bold tracking-wide text-white ${wordmarkClassName}`}>AEGIS</span>
      )}
    </div>
  );
}
