interface IdentityScoreProps {
  score: number;
  size?: 'sm' | 'lg';
}

export function IdentityScore({ score, size = 'lg' }: IdentityScoreProps) {
  const dimension = size === 'lg' ? 96 : 56;
  const strokeWidth = size === 'lg' ? 8 : 5;
  const radius = (dimension - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <svg width={dimension} height={dimension} className="-rotate-90">
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="#212A35"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="#1E63FF"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p
          className={
            size === 'lg' ? 'text-2xl font-bold text-white' : 'text-lg font-bold text-white'
          }
        >
          {score}
          <span className="text-sm font-normal text-[#8B95A5]">/100</span>
        </p>
        <p className="text-xs text-[#8B95A5]">Identity Score</p>
      </div>
    </div>
  );
}
