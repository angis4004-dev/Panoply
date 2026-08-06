'use client';

import { useEffect } from 'react';
import LoadingBars from '@/components/ui/loading-bars';

export default function GlobalError({
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
    <html lang="en">
      <body className="bg-[#0A0E13] text-[#E7ECF2] antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
          <LoadingBars />
          <div className="max-w-sm space-y-2">
            <h1 className="text-lg font-bold">Aegis is temporarily unavailable</h1>
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
      </body>
    </html>
  );
}
