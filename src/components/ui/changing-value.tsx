'use client';

import { useEffect, useState } from 'react';

/**
 * A figure that changes only when its value does.
 *
 * The Overview polls. A poll that returns the same number must leave the
 * screen exactly as it was - the blinking the dashboard used to do came from
 * breaking that - so this compares text, not renders. When the text really
 * changes, the old figure fades out through a 2px blur and the new one fades
 * in, 180ms, so the change reads as one number becoming another rather than
 * a flicker. Under prefers-reduced-motion it swaps instantly.
 *
 * `mutedDecimals` sets everything after the last decimal point at half
 * strength, for money figures where the cents are the least important part.
 */
export function ChangingValue({
  text,
  mutedDecimals = false,
}: {
  text: string;
  mutedDecimals?: boolean;
}) {
  const [shown, setShown] = useState(text);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (text === shown) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(text);
      return;
    }
    setFading(true);
    const timer = window.setTimeout(() => {
      setShown(text);
      setFading(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [text, shown]);

  const dot = mutedDecimals ? shown.lastIndexOf('.') : -1;
  return (
    <span
      className={`inline-block transition-[opacity,filter] duration-[180ms] ease-ds-out motion-reduce:transition-none ${
        fading ? 'opacity-0 blur-[2px]' : 'opacity-100 blur-0'
      }`}
    >
      {dot > 0 ? (
        <>
          {shown.slice(0, dot)}
          <span className="opacity-50">{shown.slice(dot)}</span>
        </>
      ) : (
        shown
      )}
    </span>
  );
}
