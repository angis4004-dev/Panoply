import type { CSSProperties } from 'react';

interface LoaderProps {
  /** Box size in pixels. The discs are sized from it. */
  size?: number;
  /**
   * What is being waited on, announced to assistive technology.
   *
   * Omit it when the loader sits next to text that already says so - a
   * button reading "Checking…", a row reading "Loading deposit addresses".
   * Announcing "Loading" a second time next to those is noise, so a loader
   * with no label is marked decorative instead.
   */
  label?: string;
  className?: string;
}

/**
 * The app's busy indicator.
 *
 * One component for every wait, from a 16px disc inside a submit button to a
 * 56px one on an otherwise empty page. Before this the app had four unrelated
 * indicators - a lucide Loader2, a hand-rolled spinning SVG in the sign-in
 * screen, a blurred conic-gradient ring on the route loader, and a GSAP bar
 * chart - so which one you saw depended on which screen you happened to be
 * waiting on.
 *
 * Motion and layout live in the .ds-loader rule in styles/tailwind.css. This
 * only chooses a size, a colour source and how it is announced.
 */
export function Loader({ size = 32, label, className = '' }: LoaderProps) {
  const style = { '--ds-loader-size': `${size}px` } as CSSProperties;

  if (label) {
    return (
      <span className={`ds-loader ${className}`} style={style} role="status" aria-label={label} />
    );
  }

  return <span className={`ds-loader ${className}`} style={style} aria-hidden="true" />;
}

interface LoadingStateProps {
  /** Shown under the loader, and announced. Keep it specific. */
  message: string;
  size?: number;
  className?: string;
}

/**
 * A centred loader with its message underneath.
 *
 * The shape a dozen screens were each building by hand for the same job -
 * waiting on the one fetch that the whole panel depends on. Announced as a
 * single live region so a screen reader hears the message rather than a bare
 * "Loading" followed by unrelated text.
 */
export function LoadingState({ message, size = 40, className = '' }: LoadingStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 py-10 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <Loader size={size} className="text-primary" />
      <p className="text-sm text-ds-text-muted">{message}</p>
    </div>
  );
}

export default Loader;
