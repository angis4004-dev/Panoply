export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#1a2430] ${className}`} />;
}
