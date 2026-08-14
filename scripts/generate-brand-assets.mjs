/**
 * Rebuilds every rasterised copy of the Panoply mark from one definition.
 *
 * The mark exists in four places: the React component, the Apple touch icon,
 * favicon.ico, and a base64 PNG inlined into transactional email. Only the
 * first is authored; the rest are generated here, because four hand-maintained
 * copies of the same rosette is four chances for the brand to drift and for
 * nobody to notice which one is wrong.
 *
 * The geometry constants below mirror src/components/ui/PanoplyLogo.tsx and
 * are asserted against it on every run - if the component changes and this
 * does not, the script refuses rather than quietly emitting a stale mark.
 *
 *   node scripts/generate-brand-assets.mjs
 *   node scripts/generate-brand-assets.mjs --check   # CI: fail if stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

// Keep in step with src/components/ui/PanoplyLogo.tsx.
const CIRCLES = 10;
const CIRCLE_R = 30;
const ORBIT_R = CIRCLE_R / 3;
const CREAM = '#FFF0C9';
const SURFACE = '#0A0E13';

/** The silhouette every tier shares: outer edge and central void. */
const OUTER_R = CIRCLE_R + ORBIT_R;
const VOID_R = CIRCLE_R - ORBIT_R;

/** Mirrors markStrokeWidth() in the component. */
const strokeFor = (size) => Math.min(3, Math.max(1.1, 100 / size));

/**
 * Reads the constants back out of the component and compares.
 *
 * A regex over source is crude, but this script runs on plain node and cannot
 * import the TSX. The alternative - trusting that two files stay in step - is
 * exactly the failure this script exists to prevent.
 */
function assertInStepWithComponent() {
  const source = readFileSync(join(ROOT, 'src/components/ui/PanoplyLogo.tsx'), 'utf8');
  const read = (name) => {
    const match = source.match(new RegExp(`const ${name} = ([^;]+);`));
    if (!match) throw new Error(`Could not find ${name} in PanoplyLogo.tsx`);
    const expression = match[1].trim();
    // Only the two shapes the component actually uses: a bare number, or
    // CIRCLE_R over a divisor. Deliberately not eval - this reads a source
    // file and evaluating whatever it finds there would be a silly thing to
    // do for the sake of parsing "30".
    if (/^-?\d+(\.\d+)?$/.test(expression)) return Number(expression);
    const ratio = expression.match(/^CIRCLE_R\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (ratio) return CIRCLE_R / Number(ratio[1]);
    throw new Error(`Cannot read ${name} from PanoplyLogo.tsx: "${expression}"`);
  };
  const mismatches = [
    ['CIRCLES', CIRCLES, read('CIRCLES')],
    ['CIRCLE_R', CIRCLE_R, read('CIRCLE_R')],
    ['ORBIT_R', ORBIT_R, read('ORBIT_R')],
  ].filter(([, here, there]) => here !== there);

  if (mismatches.length) {
    for (const [name, here, there] of mismatches) {
      console.error(`  ${name}: this script has ${here}, the component has ${there}`);
    }
    throw new Error('Geometry has drifted from PanoplyLogo.tsx. Update the constants here.');
  }
}

/**
 * The mark, cut for the size it will actually be rasterised at.
 *
 * Ten hairline circles need about 20 device pixels of ring band to stay ten
 * distinguishable circles. At 32px the band is six pixels and at 16px it is
 * three, so a straight render of the full rosette averages down to a flat grey
 * donut - the cream goes olive, the weave disappears, and the tab shows a
 * smudge. That is what a favicon of this mark looked like before this tiering
 * existed.
 *
 * So the mark is redrawn, not merely scaled:
 *
 *   >= 64px  the full ten-circle rosette
 *   24-63px  six circles at a heavier stroke - the same rosette with fewer,
 *            legible lobes, still visibly a weave
 *   < 24px   the silhouette alone: a solid cream annulus between the outer
 *            edge and the central void
 *
 * Every tier keeps OUTER_R and VOID_R, so the proportion the mark is
 * recognised by - a void exactly half the overall width - survives all the way
 * down to 16px. Only the detail inside the band is spent.
 */
function markPaths(size) {
  if (size < 24) {
    // Two subpaths, even-odd filled: outer disc minus the void.
    const arc = (r) => `M${50 - r} 50a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
    return `<path fill="${CREAM}" fill-rule="evenodd" d="${arc(OUTER_R)} ${arc(VOID_R)}" />`;
  }

  const count = size >= 64 ? CIRCLES : 6;
  // Six lobes get a fixed heavier stroke: solved for 32px, where one viewBox
  // unit is a third of a device pixel, so 5 lands on a stroke of about 1.6px.
  const stroke = size >= 64 ? strokeFor(size) : 5;
  const circles = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const cx = (50 + Math.cos(angle) * ORBIT_R).toFixed(3);
    const cy = (50 + Math.sin(angle) * ORBIT_R).toFixed(3);
    return `<circle cx="${cx}" cy="${cy}" r="${CIRCLE_R}"/>`;
  }).join('\n    ');

  return `<g fill="none" stroke="${CREAM}" stroke-width="${stroke}">\n    ${circles}\n  </g>`;
}

/** Rounded dark tile behind a cream mark. For app icons. */
function boxed(size) {
  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`,
    `  <rect width="100" height="100" rx="20" fill="${SURFACE}"/>`,
    `  ${markPaths(size)}`,
    '</svg>',
  ].join('\n');
}

/** Transparent, cream mark. For email, where a tile reads as a boxed logo. */
function bare(size) {
  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`,
    `  ${markPaths(size)}`,
    '</svg>',
  ].join('\n');
}

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 900 }).resize(size, size).png().toBuffer();

/**
 * Packs PNGs into a real multi-image ICO container.
 *
 * sharp cannot write ICO, and the previous version of this script papered over
 * that by writing a bare PNG to a file named favicon.ico. Browsers tolerate
 * that, but it can only ever hold one size, which is the other half of why the
 * tab icon was a smudge: a single 32px image was being scaled down to 16 by
 * the browser on top of everything else.
 *
 * PNG-compressed ICO entries are read by every browser and by Windows since
 * Vista, so the images below go in as-is rather than as BMP.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, data }, index) => {
    const at = index * 16;
    // 0 means 256 in this field; nothing here is that big, but the rule is
    // part of the format.
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2); // palette entries: none, it is truecolour
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

const emailModule = (base64) => `/**
 * Base64 payload (no "data:" prefix) of the transparent Panoply mark PNG,
 * rendered from the same circle geometry as PanoplyMark in
 * src/components/ui/PanoplyLogo.tsx. Generated - run
 * scripts/generate-brand-assets.mjs rather than editing by hand.
 *
 * Transparent rather than taken from apple-icon.png, which bakes in a dark
 * background rect; using that is why the logo used to look boxed in email
 * clients.
 *
 * Sent as a CID inline attachment, not a data-URI <img src>: Gmail strips
 * data: URIs from HTML email bodies entirely (shows as a broken-image icon),
 * while every major client - including Gmail - reliably renders an inline
 * attachment referenced via <img src="cid:...">. See generateHtmlReport /
 * sendEmailReport in the portfolio-builder route for where this is attached
 * and referenced.
 */
export const PANOPLY_LOGO_BASE64 =
  '${base64}';
`;

async function main() {
  assertInStepWithComponent();

  const outputs = [];

  outputs.push(['src/app/apple-icon.png', await png(boxed(180), 180)]);

  /*
   * 16 is the tab, 32 is the tab on a HiDPI display and most bookmark bars,
   * 48 is the Windows shortcut and taskbar. Each is rendered at its own size
   * so it gets its own tier of the mark rather than a downscale of a bigger
   * one.
   *
   * No icon.svg alongside this any more. Chrome prefers an SVG icon over the
   * ICO whenever both are declared, and an SVG cannot know what size it is
   * being painted at - so declaring one handed the tab back to the untiered
   * full rosette and undid the whole exercise. The ICO is the format that can
   * carry a different drawing per size, which is exactly the problem here.
   */
  const sizes = [16, 32, 48];
  const entries = await Promise.all(
    sizes.map(async (size) => ({ size, data: await png(boxed(size), size) }))
  );
  outputs.push(['src/app/favicon.ico', ico(entries)]);

  const emailPng = await png(bare(200), 200);
  outputs.push(['src/lib/email-logo.ts', Buffer.from(emailModule(emailPng.toString('base64')))]);

  let stale = 0;
  for (const [relative, content] of outputs) {
    const target = join(ROOT, relative);
    let current = null;
    try {
      current = readFileSync(target);
    } catch {
      /* first run */
    }
    const same = current && current.equals(content);
    if (same) {
      console.info(`  = ${relative}`);
      continue;
    }
    stale += 1;
    if (CHECK_ONLY) {
      console.info(`  ! ${relative} is stale`);
    } else {
      writeFileSync(target, content);
      console.info(`  + ${relative}`);
    }
  }

  if (CHECK_ONLY && stale) {
    console.error(`\n${stale} asset(s) stale. Run: node scripts/generate-brand-assets.mjs`);
    process.exit(1);
  }
  console.info(`\n${CHECK_ONLY ? 'All brand assets current' : 'Brand assets regenerated'}.\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
