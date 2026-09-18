import type { SVGProps } from 'react';

/*
 * Panoply's own nav glyphs.
 *
 * Drawn from the parts of the brand mark rather than taken from a stock set:
 * the rosette is circles and nothing else, so these are circles and arcs with
 * at most a short straight stroke. That shared grammar is what makes them read
 * as one family beside the logo instead of a library dropped in next to it.
 *
 * The recurring device is the aperture - the clean central void the rosette is
 * recognised by. Most glyphs keep a small circle at their point of focus: the
 * lock's keyhole, the allocation's hub, the two ends of a flow.
 *
 * Same calling shape as a Lucide icon: sized by className, coloured by
 * currentColor. So they drop into the existing `icon: Icon` slots and the
 * sidebar's `.nav-icon` rule - which thickens the active row's stroke - applies
 * to them unchanged.
 *
 * stroke-width is set as an attribute, not inline style, on purpose. A
 * presentation attribute loses to any CSS rule, which is what lets
 * `[data-nav-active='true'] .nav-icon` lift it to 2.25. An inline style would
 * beat that rule and the active row would stop getting heavier.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Four even units: the grid built from the brand's own circle. */
export function OverviewIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="16" cy="8" r="3.5" />
      <circle cx="8" cy="16" r="3.5" />
      <circle cx="16" cy="16" r="3.5" />
    </Glyph>
  );
}

/** The rosette reduced to three circles, so the assistant wears the brand. */
export function AskIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="8.6" r="5" />
      <circle cx="14.9" cy="13.7" r="5" />
      <circle cx="9.1" cy="13.7" r="5" />
    </Glyph>
  );
}

/** A path between two apertures: source to output. */
export function FlowsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M6 15.5C6 10 18 14 18 8.5" />
    </Glyph>
  );
}

/** A circle held shut, with its keyhole: capital locked in and kept. */
export function VaultsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="15" r="6" />
      <circle cx="12" cy="15" r="1.6" />
    </Glyph>
  );
}

/** Three circles, each larger than the last: a return compounding. */
export function YieldIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="5.5" cy="18.5" r="2" />
      <circle cx="10.5" cy="13.5" r="3" />
      <circle cx="17" cy="7" r="4.5" />
    </Glyph>
  );
}

/** An allocation split three ways around a hub. */
export function BuilderIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 9.5V3M14.17 13.25l5.62 3.25M10.23 13.77 5.64 18.36" />
    </Glyph>
  );
}

/** Into the bowl. Shares its bowl with Withdraw so the two read as a pair. */
export function DepositIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12a7 7 0 0 0 14 0" />
      <path d="M12 3v10M8.5 9.5 12 13l3.5-3.5" />
    </Glyph>
  );
}

/** Out of the bowl. */
export function WithdrawIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12a7 7 0 0 0 14 0" />
      <path d="M12 13V3M8.5 6.5 12 3l3.5 3.5" />
    </Glyph>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Glyph>
  );
}

export function VerifyIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.5 2.5 4.8-5.1" />
    </Glyph>
  );
}

/** A medal with the aperture at its centre. */
export function AchievementsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="9.5" r="5.5" />
      <circle cx="12" cy="9.5" r="1.8" />
      <path d="M9 14.6 7.5 21l4.5-2 4.5 2-1.5-6.4" />
    </Glyph>
  );
}

/** A six-tooth dial rather than a stock gear. */
export function SettingsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M18.5 12H21M15.25 17.63l1.25 2.16M8.75 17.63 7.5 19.79M5.5 12H3M8.75 6.37 7.5 4.21M15.25 6.37l1.25-2.16" />
    </Glyph>
  );
}

/*
 * Card glyphs.
 *
 * The Overview's metric cards had stock chips - a dollar sign, a target, a
 * processor, a lightning bolt, a trend arrow, a warning triangle - under a
 * sidebar that is now drawn from the logo. These finish the job in the same
 * grammar. Largest allocation and signal flows reuse BuilderIcon and
 * FlowsIcon, which already mean those things.
 */

/** A return rising to a point. */
export function PnlIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 19c7 0 11-4 13.6-11.2" />
      <circle cx="18.5" cy="5.5" r="2" />
    </Glyph>
  );
}

/** Rings closing on the aperture: flows that hit. */
export function ProfitIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.3" />
    </Glyph>
  );
}

/** A half-dial with its needle. */
export function ConfidenceIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="M12 16l3.6-5.4" />
      <circle cx="12" cy="16" r="1.6" />
    </Glyph>
  );
}

/** Capital leaving the aperture, into work. */
export function DeployIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="6" cy="12" r="3" />
      <path d="M9 12h11M16.5 8.5 20 12l-3.5 3.5" />
    </Glyph>
  );
}

/** The P&L glyph falling instead of rising. */
export function DrawdownIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 5c7 0 11 4 13.6 11.2" />
      <circle cx="18.5" cy="18.5" r="2" />
    </Glyph>
  );
}
