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
        'bg-[#10151C] border border-[1px] solid #212A35 rounded-[10px]',
        hover && 'hover:bg-[#161D26]/50',
        className
      )}
    >
      {children}
    </div>
  );
}
