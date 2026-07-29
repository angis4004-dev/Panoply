'use client';

import { motion } from 'framer-motion';

const BAR_COLORS = ['#1E63FF', '#3D8BFF', '#00D4FF', '#5EEAD4', '#00C896', '#7B61FF', '#1E63FF'];

export default function LoadingBars({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-10 items-end gap-2 ${className}`} role="status" aria-label="Loading">
      {BAR_COLORS.map((color, i) => (
        <motion.span
          key={i}
          className="w-2.5 rounded-full motion-reduce:animate-none"
          style={{ backgroundColor: color, height: '100%', transformOrigin: 'bottom' }}
          animate={{ scaleY: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.09,
          }}
        />
      ))}
    </div>
  );
}
