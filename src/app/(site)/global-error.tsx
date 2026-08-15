'use client';

import { useEffect } from 'react';
/*
 * global-error replaces the root layout when it renders, so nothing that
 * layout imports reaches this file - including the stylesheet. Every Tailwind
 * class below was therefore inert, and the loader's .ds-loader rule would be
 * missing too, leaving a blank gap where the spinner should be. Imported here
 * explicitly so this screen is actually styled.
 */
import '../../styles/tailwind.css';
import { Loader } from '@/components/ui/loader';

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
          <Loader size={48} className="text-brand-cream" />
          <div className="max-w-sm space-y-2">
            <h1 className="text-lg font-bold">Panoply is temporarily unavailable</h1>
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
