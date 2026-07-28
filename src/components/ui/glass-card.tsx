import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export function GlassCard({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-[#122131]/50 border border-[#212A35] rounded-xl',
        hover && 'transition-colors hover:bg-[#17202e]/50',
        className
      )}
    >
      {children}
    </div>
  );
}
