import { PanoplyMark } from '@/components/ui/PanoplyLogo';

/**
 * The hero diagram: what happens to a deposit, built one step at a time.
 *
 *   USDT deposit  ->  Panoply  ->  Signal flow
 *                              ->  Vault
 *                              ->  Yield
 *
 * The motion follows the reference recording: a 12-second loop that draws the
 * deposit line, brings up the Panoply block, then draws each branch and brings
 * its card in (the card, then its words), holds the finished picture, and fades
 * back to the deposit alone before building again. Only the deposit mark is
 * on screen the whole time - it is where every cycle starts.
 *
 * Lit, not outlined. Every surface takes its edge from light rather than a
 * grey stroke: a soft cream glow sits behind the Panoply block and behind each
 * card as it arrives, a faint green one behind the deposit, surfaces are
 * gentle top-to-bottom gradients with a hairline highlight on the top edge,
 * and each connector is a thin line over a wide, faint halo so it reads as
 * light moving rather than a flowchart arrow. Glows are radial gradients, not
 * SVG blur filters: a filter under an animating dash would repaint every
 * frame, a gradient costs nothing.
 *
 * All timing lives in styles/tailwind.css under "Hero flow", as one keyframe
 * per step on a shared 12s clock. The rosette turns once a minute and the
 * Panoply glow breathes slowly - the two quiet signs it is working.
 * Reduced motion: the finished diagram, still.
 *
 * Two drawings of the same single row. The wide one is used from `sm` up; a
 * phone gets a compressed copy in the same left-to-right order, since the
 * wide one would scale its labels down to 7px there. Gradient ids carry a
 * per-drawing prefix because both SVGs are in the DOM at once.
 */

const CREAM = '#FFF0C9';
const SANS = 'var(--font-sans)';

/** Shared gradients for one drawing. `p` prefixes every id. */
function Defs({ p }: { p: string }) {
  return (
    <defs>
      <radialGradient id={`${p}-glow`}>
        <stop offset="0" stopColor={CREAM} stopOpacity="0.2" />
        <stop offset="0.45" stopColor={CREAM} stopOpacity="0.07" />
        <stop offset="1" stopColor={CREAM} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-glow-green`}>
        <stop offset="0" stopColor="#26A17B" stopOpacity="0.28" />
        <stop offset="1" stopColor="#26A17B" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${p}-surface`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#172330" />
        <stop offset="1" stopColor="#0C131A" />
      </linearGradient>
      <linearGradient id={`${p}-edge`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={CREAM} stopOpacity="0.26" />
        <stop offset="1" stopColor={CREAM} stopOpacity="0.05" />
      </linearGradient>
    </defs>
  );
}

/**
 * Tether's mark, from the CC0 cryptocurrency-icons set: the brand green disc
 * and the T with its elliptical band. Drawn from the published geometry rather
 * than approximated, because a wrong-looking USDT logo on a page asking people
 * to deposit USDT is the one place an approximation costs trust.
 */
function TetherMark({ x, y, size, p }: { x: number; y: number; size: number; p: string }) {
  const c = size / 2;
  return (
    <g>
      <circle cx={x + c} cy={y + c} r={size * 1.1} fill={`url(#${p}-glow-green)`} />
      <svg x={x} y={y} width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="16" fill="#26A17B" />
        <path
          fill="#FFFFFF"
          d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"
        />
      </svg>
    </g>
  );
}

/**
 * A connector: a wide faint halo under a thin line, ending in a small rounded
 * chevron. Every connector ends travelling right, so the chevron is built from
 * the end point alone. `step` picks its keyframe (hf-line-N).
 */
function Connector({ d, end, step }: { d: string; end: [number, number]; step: number }) {
  const [ex, ey] = end;
  const head = `M${ex - 4.5} ${ey - 4} L${ex} ${ey} L${ex - 4.5} ${ey + 4}`;
  return (
    <g
      className={`hf-line hf-line-${step}`}
      fill="none"
      stroke={CREAM}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} pathLength={1} strokeOpacity={0.1} strokeWidth={6} />
      <path d={d} pathLength={1} strokeOpacity={0.6} strokeWidth={1.25} />
      <path d={head} pathLength={1} strokeOpacity={0.7} strokeWidth={1.25} />
    </g>
  );
}

/** A lit surface: gradient fill, fading cream edge, hairline top highlight. */
function Surface({
  x,
  y,
  width,
  height,
  radius,
  p,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  p: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill={`url(#${p}-surface)`}
        stroke={`url(#${p}-edge)`}
      />
      <path
        d={`M${x + radius} ${y + 0.75} H${x + width - radius}`}
        stroke="#FFFFFF"
        strokeOpacity={0.08}
        strokeLinecap="round"
      />
    </g>
  );
}

/** A destination card: words only, lit from behind as it arrives. */
function OutputCard({
  x,
  y,
  width,
  height,
  title,
  detail,
  step,
  compact,
  p,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail: string;
  step: number;
  compact?: boolean;
  p: string;
}) {
  const textX = x + (compact ? 12 : 16);
  const [t, d] = compact ? [13, 11] : [14, 12];
  const detailGap = compact ? 12 : 14;
  return (
    <g>
      {/* The glow and the card arrive together; the words follow a beat later. */}
      <g className={`hf-card hf-card-${step}`}>
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width * 0.7}
          ry={height * 1.1}
          fill={`url(#${p}-glow)`}
          opacity={0.55}
        />
        <Surface x={x} y={y} width={width} height={height} radius={compact ? 11 : 14} p={p} />
      </g>
      <g className={`hf-text hf-text-${step}`}>
        <text
          x={textX}
          y={y + height / 2 - 3}
          fill="#E7ECF2"
          style={{ font: `500 ${t}px ${SANS}` }}
        >
          {title}
        </text>
        <text
          x={textX}
          y={y + height / 2 + detailGap}
          fill="#8B95A5"
          style={{ font: `400 ${d}px ${SANS}` }}
        >
          {detail}
        </text>
      </g>
    </g>
  );
}

/** The Panoply block: a lit, recessed square with the turning rosette. */
function PanoplyBlock({
  x,
  y,
  size,
  wordSize,
  p,
}: {
  x: number;
  y: number;
  size: number;
  wordSize: number;
  p: string;
}) {
  const inset = Math.round(size * 0.08);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const mark = Math.round(size * 0.22);
  const radius = Math.round(size * 0.13);
  return (
    <g className="hf-block">
      {/* The breathing light behind the block. */}
      <ellipse
        className="hf-breathe"
        cx={cx}
        cy={cy}
        rx={size * 1.05}
        ry={size * 0.95}
        fill={`url(#${p}-glow)`}
      />
      <Surface x={x} y={y} width={size} height={size} radius={radius} p={p} />
      <rect
        x={x + inset}
        y={y + inset}
        width={size - inset * 2}
        height={size - inset * 2}
        rx={radius - 4}
        fill="#0A0E13"
        stroke={CREAM}
        strokeOpacity={0.06}
      />
      <g transform={`translate(${cx - mark / 2} ${y + size * 0.2})`} style={{ color: CREAM }}>
        <g className="hf-spin">
          <PanoplyMark size={mark} />
        </g>
      </g>
      <text
        x={cx}
        y={y + size * 0.66}
        textAnchor="middle"
        fill="#F2EEE6"
        style={{ font: `600 ${wordSize}px var(--font-display)`, letterSpacing: '0.08em' }}
      >
        PANOPLY
      </text>
    </g>
  );
}

const TITLE = 'You deposit USDT, and Panoply puts it to work in signal flows, vaults and yield.';

const OUTPUTS: { title: string; detail: string }[] = [
  { title: 'Signal flow', detail: 'BTC momentum' },
  { title: 'Vault', detail: 'Risk-managed' },
  { title: 'Yield', detail: 'Across 3 chains' },
];

function WideFlow() {
  const p = 'hfw';
  const cardY = [26, 119, 212];
  return (
    <svg
      viewBox="0 0 540 300"
      className="hidden h-auto w-full overflow-visible sm:block"
      role="img"
      aria-label={TITLE}
    >
      <Defs p={p} />

      {/* Centred on y=150, the Panoply block's middle. */}
      <TetherMark x={26} y={128} size={44} p={p} />
      <text x={48} y={198} textAnchor="middle" fill="#E7ECF2" style={{ font: `500 13px ${SANS}` }}>
        USDT
      </text>
      <text
        x={48}
        y={215}
        textAnchor="middle"
        fill="#8B95A5"
        style={{ font: `400 11.5px ${SANS}` }}
      >
        Deposit
      </text>

      <Connector d="M86 150 H174" end={[174, 150]} step={0} />
      <Connector
        d="M334 128 H350 Q362 128 362 116 V69 Q362 57 374 57 H390"
        end={[390, 57]}
        step={1}
      />
      <Connector d="M334 150 H390" end={[390, 150]} step={2} />
      <Connector
        d="M334 172 H350 Q362 172 362 184 V231 Q362 243 374 243 H390"
        end={[390, 243]}
        step={3}
      />

      <PanoplyBlock x={186} y={76} size={148} wordSize={21} p={p} />

      {OUTPUTS.map((o, i) => (
        <OutputCard
          key={o.title}
          {...o}
          x={400}
          y={cardY[i]}
          width={138}
          height={62}
          step={i + 1}
          p={p}
        />
      ))}
    </svg>
  );
}

/**
 * The phone drawing: the same single left-to-right row as the wide one,
 * compressed rather than restacked. The viewBox is 340 wide so it renders
 * close to 1:1 in a phone column and no label drops much below 11px.
 */
function CompactFlow() {
  const p = 'hfc';
  const cardY = [26, 86, 146];
  return (
    <svg
      viewBox="0 0 340 196"
      className="block h-auto w-full overflow-visible sm:hidden"
      role="img"
      aria-label={TITLE}
    >
      <Defs p={p} />

      {/* Centred on y=110, the Panoply block's middle, so all three stages
          sit on one line. */}
      <TetherMark x={4} y={92} size={36} p={p} />
      <text x={22} y={146} textAnchor="middle" fill="#E7ECF2" style={{ font: `500 12px ${SANS}` }}>
        USDT
      </text>
      <text
        x={22}
        y={160}
        textAnchor="middle"
        fill="#8B95A5"
        style={{ font: `400 10.5px ${SANS}` }}
      >
        Deposit
      </text>

      <Connector d="M46 110 H78" end={[78, 110]} step={0} />
      <Connector d="M176 90 H182 Q190 90 190 82 V58 Q190 50 198 50 H204" end={[204, 50]} step={1} />
      <Connector d="M176 110 H204" end={[204, 110]} step={2} />
      <Connector
        d="M176 130 H182 Q190 130 190 138 V162 Q190 170 198 170 H204"
        end={[204, 170]}
        step={3}
      />

      <PanoplyBlock x={86} y={65} size={90} wordSize={12} p={p} />

      {OUTPUTS.map((o, i) => (
        <OutputCard
          key={o.title}
          {...o}
          x={212}
          y={cardY[i]}
          width={126}
          height={48}
          step={i + 1}
          compact
          p={p}
        />
      ))}
    </svg>
  );
}

export function HeroFlow({ className = '' }: { className?: string }) {
  return (
    <figure className={className}>
      <WideFlow />
      <CompactFlow />
    </figure>
  );
}
