/**
 * Demo mode: generated performance figures for showing the product.
 *
 * Off unless DEMO_MODE is explicitly true. When on, the dashboard's P&L
 * figures are produced here instead of being read from real fills, so the
 * product can be demonstrated without waiting for a market to do something
 * interesting.
 *
 * ## The labelling is not decoration
 *
 * Everything this module produces is invented. It is not a forecast, a
 * backtest, or a slow day at the venue - it is a curve chosen to look good.
 * Any surface that renders these numbers also renders the demo banner, and
 * `isDemoMode()` is exported precisely so that no caller can obtain the
 * figures without being able to tell that they are fake.
 *
 * The platform takes real deposits. A number here that reached a depositor
 * without its label is a claim about their money that nobody can honour, so
 * the two travel together and the flag is read from the environment rather
 * than from the database - a demo cannot be switched on from a browser
 * session, and a production deployment that never sets the variable can never
 * show a generated figure.
 */

export const DEMO_BANNER =
  'Demonstration data. These figures are generated to illustrate the interface and do not represent real trades, real market results, or funds that can be withdrawn.';

export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DEMO_MODE ?? '').trim().toLowerCase();
  // Only an explicit affirmative. The string "false" is truthy in JavaScript.
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Share of days that close up. Configurable; defaults to the 70/30 split. */
export function demoWinRate(env: NodeJS.ProcessEnv = process.env): number {
  const text = (env.DEMO_WIN_RATE ?? '').trim();
  /*
   * The empty check has to come first. Number('') is 0, which is finite and
   * inside the range, so without this an unset variable reads as a win rate of
   * zero - every day a loss, the exact opposite of the default.
   */
  if (text === '') return 0.7;

  const raw = Number(text);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return 0.7;
  return raw;
}

/**
 * A deterministic pseudo-random stream.
 *
 * Seeded so the same account shows the same curve on every reload. A demo that
 * reshuffles its own history each time someone refreshes is obviously fake in
 * the one way that undermines a demo, and it also makes the chart impossible
 * to talk about while presenting.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, so a user id can seed the stream. */
function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A repeatable pseudo-random value in [0,1) for one integer lattice point. */
function latticeNoise(seed: number, index: number): number {
  let t = (Math.imul(index, 0x27d4eb2d) ^ seed) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Smoothstep, so the curve between lattice points has no visible corners. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Fractal value noise: several octaves of smoothed noise summed together.
 *
 * This is what makes the line look like a market rather than a spreadsheet.
 * A single frequency gives a regular wobble that reads as decoration; summing
 * halving amplitudes at doubling frequencies produces detail at every zoom
 * level, which is the property real price series have and interpolation does
 * not.
 *
 * Deterministic in `x`, so the same instant always returns the same value and
 * a refetch does not redraw history.
 */
function fractalNoise(seed: number, x: number, octaves = 7, falloff = 0.62): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let normalizer = 0;

  for (let o = 0; o < octaves; o++) {
    const scaled = x * frequency;
    const i = Math.floor(scaled);
    const f = smooth(scaled - i);
    const a = latticeNoise(seed + o * 7919, i);
    const b = latticeNoise(seed + o * 7919, i + 1);
    // Centred on zero so the noise adds no net drift of its own.
    total += (a + (b - a) * f - 0.5) * 2 * amplitude;
    normalizer += amplitude;
    // Slower than the usual halving. At 0.5 the fine octaves are too quiet to
    // see and the line reads as a smooth arc; the detail that makes it look
    // like a market lives in the high frequencies.
    amplitude *= falloff;
    frequency *= 2;
  }

  return total / normalizer;
}

const DAY_MS = 86_400_000;

/**
 * When a demo account's history is taken to begin.
 *
 * Fixed rather than rolling, so the same instant always returns the same
 * cumulative figure. A rolling origin would quietly restate history every day,
 * which is the one thing a chart must not do while someone is presenting it.
 */
export const DEMO_EPOCH = Date.UTC(2026, 0, 1);

export interface DemoSeriesInput {
  /** Seeds the curve. Same key, same shape, every time. */
  seed: string;
  /** Capital the figures are scaled against. */
  allocatedCapital: number;
  /** Sample timestamps, ascending, in epoch milliseconds. */
  sampleTimes: number[];
  winRate?: number;
  /**
   * When this flow began trading, in epoch milliseconds.
   *
   * The curve starts at zero here and accumulates forward; anything sampled
   * before it is zero, because the flow did not exist to earn it.
   *
   * Defaults to DEMO_EPOCH only so a caller with no flow behind it - a
   * portfolio-level curve, a test - still gets a series. Anything representing
   * a real flow must pass its creation time. See flowStartMs.
   */
  startedAt?: number;
}

/**
 * A flow's start time as epoch milliseconds, for seeding its demo curve.
 *
 * Falls back to DEMO_EPOCH for a document with no usable createdAt. That is
 * the safe direction: a flow whose age cannot be established is treated as
 * long-running rather than brand new, so an unparseable date cannot silently
 * erase a figure the trader has been watching.
 */
export function flowStartMs(createdAt: Date | string | null | undefined): number {
  if (!createdAt) return DEMO_EPOCH;
  const ms = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Number.isFinite(ms) ? ms : DEMO_EPOCH;
}

/**
 * A cumulative P&L curve with the requested win rate.
 *
 * Built day by day rather than sample by sample: the win rate is a statement
 * about days, so a day is the unit that wins or loses. Within a day the value
 * walks toward that day's close, which is what makes an intraday view move
 * instead of stepping once at midnight.
 *
 * Winning days are smaller than losing days are large, which is the opposite
 * of what flatters a chart - but a 70% win rate with symmetric magnitudes
 * compounds into a slope no real strategy produces, and a curve that obvious
 * is not useful even as a demonstration.
 */
export function demoPnlSeries(input: DemoSeriesInput): number[] {
  const { seed, allocatedCapital, sampleTimes } = input;
  const winRate = input.winRate ?? 0.7;

  if (sampleTimes.length === 0 || allocatedCapital <= 0) {
    return sampleTimes.map(() => 0);
  }

  const random = mulberry32(hashSeed(seed));

  /*
   * Accumulation starts when the flow started, not at the start of the
   * requested window and not at a date shared by every flow.
   *
   * Cumulative P&L is an absolute quantity: the figure at a given instant is
   * the same whether you asked for a one-day chart or a one-year one. Starting
   * the walk at the window's first sample made it window-relative, so every
   * view opened at zero, and sampling a single instant - which is what a flow
   * card does - returned zero because there was no history in front of it.
   *
   * Anchoring every flow to one fixed epoch fixed that but broke something
   * worse: a flow created today inherited every day since the epoch, so it
   * opened at +24% before it had traded for a second. A flow's profit has to
   * begin at zero on the day it begins.
   */
  const startedAt = input.startedAt ?? DEMO_EPOCH;
  const firstDay = Math.floor(startedAt / DAY_MS);
  const lastDay = Math.floor(sampleTimes[sampleTimes.length - 1] / DAY_MS);

  // Cumulative close for each day in the window.
  const closes = new Map<number, number>();
  let running = 0;

  for (let day = firstDay; day <= lastDay; day++) {
    /*
     * A flow's opening day always closes up.
     *
     * Every other day is drawn at the requested rate. This one is not, because
     * a 30% chance of opening red is a 30% chance that the first thing anyone
     * sees after starting a flow is a loss - and the first impression of a
     * demonstration is the whole of it. Costs nothing in plausibility: a real
     * strategy's first day is up 70% of the time anyway, and the days that
     * follow restore the full distribution.
     */
    const won = day === firstDay || random() < winRate;
    /*
     * Winners average 0.675% of capital, losers 0.625%.
     *
     * Losers were 0.95% against winners of 0.55%, which left a net drift of
     * +0.10% a day - thinner than a single day's noise. A 30-day window came
     * out negative roughly a fifth of the time, so a demonstration of a
     * profitable strategy could sit in the red for a month. The drift is now
     * +0.285% a day, which clears its own variance over any window worth
     * showing, while losing days stay large enough to cut visible drawdowns
     * into the line.
     */
    const magnitude = won ? 0.0025 + random() * 0.0085 : 0.0025 + random() * 0.0075;
    running += allocatedCapital * magnitude * (won ? 1 : -1);
    closes.set(day, running);
  }

  const openOf = (day: number): number => (day === firstDay ? 0 : (closes.get(day - 1) ?? 0));

  const noiseSeed = hashSeed(`${seed}:texture`);
  /*
   * How far the line wanders away from its trend between closes, as a share of
   * capital. Roughly the size of a typical day's move, which is what makes an
   * intraday view look like trading rather than a ramp - a real P&L line
   * crosses its own path many times a day.
   */
  const wander = allocatedCapital * 0.008;
  /**
   * Noise cycles per day at the base octave.
   *
   * Twelve, with seven octaves above it, so the finest detail cycles roughly
   * every two minutes of chart. That is what fills a one-day view; at six the
   * intraday line changed direction 34 times in 288 points and read as a
   * smooth arc rather than a market.
   */
  const NOISE_FREQUENCY = 12;

  return sampleTimes.map((ts) => {
    // Before the flow existed there is nothing to report. Drawn as a flat zero
    // up to the moment it was created, which is the truthful shape: the line
    // leaves the axis when the flow starts.
    if (ts < startedAt) return 0;

    const day = Math.floor(ts / DAY_MS);
    const open = openOf(day);
    const close = closes.get(day) ?? open;

    /*
     * Progress through the part of this day the flow was actually alive for.
     *
     * A flow created at 3pm has nine hours of its opening day, not
     * twenty-four. Measuring from midnight would drop it a third of the way
     * along its first day's trend the instant it was created - a visible jump
     * off zero, which is the exact thing this is meant to avoid.
     */
    const dayStart = day * DAY_MS;
    const from = Math.max(dayStart, startedAt);
    const span = dayStart + DAY_MS - from;
    const progress = span <= 0 ? 1 : (ts - from) / span;

    // The trend: where the day opened, heading to where it closes.
    const trend = open + (close - open) * progress;

    /*
     * The texture, pinned to zero at both ends of the day.
     *
     * That envelope is what keeps the daily closes exact while everything
     * between them wanders. Without it the noise would move each close too,
     * and the requested win rate would drift away from the one asked for -
     * the figure the whole demo is built around.
     */
    const envelope = Math.sin(Math.PI * progress);
    const texture = fractalNoise(noiseSeed, (ts / DAY_MS) * NOISE_FREQUENCY) * wander * envelope;

    return Number((trend + texture).toFixed(2));
  });
}

/**
 * One flow's demo P&L, in quote currency, at a single instant.
 *
 * Deliberately the same generator the chart uses, sampled once, seeded on the
 * flow. That is what keeps the dashboard self-consistent: the portfolio chart
 * is the sum of these per-flow curves, so the line's current value and the
 * "Realized P&L" tile are the same number by construction rather than by two
 * generators happening to agree.
 *
 * They did not agree before this. The chart was seeded on the user and the
 * flow cards on the flow, so a screen could show +$77 on the line and an
 * unrelated total beside it - the kind of discrepancy that is invisible in
 * development and obvious to whoever is being shown the product.
 */
export function demoFlowPnl(
  botId: string,
  allocatedCapital: number,
  at: number,
  winRate = 0.7,
  startedAt?: number
): number {
  if (allocatedCapital <= 0) return 0;
  return demoPnlSeries({
    seed: botId,
    allocatedCapital,
    sampleTimes: [at],
    winRate,
    startedAt,
  })[0];
}
