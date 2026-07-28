/**
 * Canonical brand hex values, for contexts that can't use Tailwind classes
 * (SVG stop-colors, Chart.js/canvas config, inline style objects). Keep in
 * sync with the `primary` / `brand.*` entries in tailwind.config.js - those
 * drive the equivalent Tailwind utility classes for everything else.
 */
export const BRAND_COLORS = {
  blue: '#243B8F',
  cyan: '#00D4FF',
  purple: '#7B61FF',
  green: '#00C896',
  paper: '#F2F5FA',
  cream: '#FFF0C9',
} as const;
