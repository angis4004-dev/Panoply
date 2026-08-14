interface PanoplyMarkProps {
  size?: number;
  className?: string;
}

/*
 * Panoply brand mark: a spirograph rosette.
 *
 * Twelve identical circles whose centres sit on a small orbit around the
 * middle. Where they overlap they cut a clean circular void in the centre -
 * the ring at radius ORBIT_R - CIRCLE_R that every circle is tangent to from
 * outside. That void is the whole mark; it is what makes the thing read as an
 * aperture rather than as a scribble, so the two radii below are the only
 * numbers that matter and neither should be changed without looking at the
 * result at 20px.
 *
 * Drawn rather than shipped as a static SVG file, because the stroke has to be
 * computed. This mark renders from 16px in a favicon to 180px on a marketing
 * page, and a single stroke-width cannot serve both: the hairline that looks
 * right at 180px works out at a fifth of a pixel at 32px and the rosette
 * dissolves into grey haze, while a width heavy enough to survive at 32px
 * turns the large version into rope.
 *
 * So the width is solved for the rendered result - roughly one device pixel -
 * and expressed back in viewBox units, which is what the `100 / size` term is.
 * The floor keeps the big version from going anaemic; the ceiling stops the
 * small one silting up the central void, which is the feature the whole mark
 * is recognised by.
 *
 * Deliberately not `vector-effect="non-scaling-stroke"`, which would express
 * this far more neatly: librsvg ignores it, and the favicon, the apple icon
 * and the inline email logo are all rasterised through librsvg via sharp. The
 * neat version would look correct in a browser and wrong in every generated
 * asset, which is worse than the arithmetic.
 *
 * Stroke is currentColor throughout. The brand sheet allows the logo on dark
 * surfaces and on light ones, and inheriting the text colour is what lets the
 * same component be cream in the navbar and near-black on a light background
 * without a variant prop or a second file.
 */

/**
 * Circles in the rosette.
 *
 * Ten, because the outer edge scallops once per circle and ten lobes is what
 * the brand sheet shows. Twelve and above closes the weave into a solid grey
 * ring at small sizes; eight leaves gaps wide enough to read as a mistake.
 */
const CIRCLES = 10;
/** Radius of each circle, in a 100x100 viewBox centred on 50,50. */
const CIRCLE_R = 30;
/**
 * How far each circle's centre sits from the middle.
 *
 * CIRCLE_R - ORBIT_R is the radius of the central void and CIRCLE_R + ORBIT_R
 * is the outer edge, so the pair sets the one proportion the mark is
 * recognised by. At R/3 those come out 20 and 40: a void exactly half the
 * overall width, which is what the reference logo measures.
 */
const ORBIT_R = CIRCLE_R / 3;

/** Rendered hairline, in viewBox units. See the note above. */
export function markStrokeWidth(size: number): number {
  return Math.min(3, Math.max(1.1, 100 / size));
}

export function PanoplyMark({ size = 32, className = '' }: PanoplyMarkProps) {
  const strokeWidth = markStrokeWidth(size);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={strokeWidth}>
        {Array.from({ length: CIRCLES }, (_, index) => {
          const angle = (index / CIRCLES) * Math.PI * 2;
          return (
            <circle
              key={index}
              cx={50 + Math.cos(angle) * ORBIT_R}
              cy={50 + Math.sin(angle) * ORBIT_R}
              r={CIRCLE_R}
            />
          );
        })}
      </g>
    </svg>
  );
}

interface PanoplyLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

/**
 * The full lockup: mark plus wordmark.
 *
 * Sentence case at normal tracking, which is how the wordmark is drawn on the
 * brand sheet. The old lockup was uppercase AEGIS with 0.12em tracking and an
 * extrabold weight - appropriate to Orbitron, wrong for this one. Schibsted
 * Grotesk at 400 is what the logo actually uses, and letterspacing it or
 * bolding it stops it matching.
 *
 * Neither the mark nor the wordmark sets a colour. Both inherit, so a caller
 * writes `text-brand-cream` on a dark surface and a dark token on a light one
 * and the two halves can never disagree with each other.
 */
export default function PanoplyLogo({
  size = 32,
  showWordmark = true,
  className = '',
  wordmarkClassName = '',
}: PanoplyLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <PanoplyMark size={size} />
      {showWordmark && (
        <span className={`font-wordmark font-normal tracking-normal ${wordmarkClassName}`}>
          Panoply
        </span>
      )}
    </div>
  );
}
