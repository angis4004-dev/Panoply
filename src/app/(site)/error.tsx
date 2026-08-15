'use client';

import { useEffect } from 'react';
import { Loader } from '@/components/ui/loader';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0A0E13] p-6 text-center">
      {/* The application's one loader, in the brand cream (#FFF0C9).
          This screen used to run LoadingBars - seven bars in blue, teal,
          green and purple, a palette that appears nowhere else in Panoply
          and reads as a different product's error page. */}
      <Loader size={48} className="text-brand-cream" />
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-bold text-[#E7ECF2]">Panoply is temporarily unavailable</h1>
        <p className="text-sm text-[#8B95A5]">
          We&apos;re reconnecting to our servers. This usually resolves in a few moments.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-[#0A0E13] transition hover:bg-[#3D77FF]"
      >
        Try again
      </button>
    </div>
  );
}
