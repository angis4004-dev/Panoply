/**
 * Deterministic performance model: capital-aware P&L, no randomness.
 *
 * A pure function of (flow id, allocated capital, creation time, sample
 * time). Given the same inputs it always returns the same figures, so a
 * reload, a server restart, or a second caller computing the portfolio total
 * from the same flows never disagrees with itself.
 *
 * That last property is the reason this module exists. The generator it
 * replaces was seeded and therefore repeatable on its own terms, but the
 * chart and the per-flow figures reached it by different routes and drifted
 * apart. Here both callers enter through the same two functions, and
 * `modelledPnlAt` is `modelledPnlSeries` sampled once - so the aggregate and
 * the line agree by construction rather than by coincidence.
 *
 * The shape is a sequence of discrete outcomes, one per completed interval
 * since a flow was created, each a gain or a loss sized as a share of that
 * flow's allocated capital. Outcome selection and magnitude are both derived
 * from an unsigned FNV-1a hash of the flow id, so two flows never produce the
 * same curve and the same flow never produces two different ones.
 */

export interface ModelledPnlInput {
  flowId: string;
  allocatedCapital: number;
  createdAt: Date | string | number | null | undefined;
  sampleTimes: number[];
}

/**
 * How often an outcome settles.
 *
 * Exported because the dashboard has to tell a trader with a brand new flow
 * how long the chart will legitimately read zero. Hardcoding that number in
 * the copy would let it drift from the model the moment this changes.
 */
export const SETTLEMENT_INTERVAL_MS = 5 * 60 * 1000;
const INTERVAL_MS = SETTLEMENT_INTERVAL_MS;
const CYCLE_SIZE = 20;
const PROFITS_PER_CYCLE = 13;

/*
 * Magnitudes are quoted per six hours - the period this model was originally
 * tuned against - and scaled down to whatever the settlement interval
 * actually is.
 *
 * Writing them this way makes the interval a presentation choice rather than
 * an economic one: shortening it changes how often the line moves, never how
 * much a flow earns in a day. The previous six-hour interval meant a flow
 * showed nothing whatsoever for its first six hours, and the one-day chart -
 * which samples every five minutes - could only ever draw four distinct steps
 * across 288 points.
 */
const TUNING_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAGNITUDE_SCALE = SETTLEMENT_INTERVAL_MS / TUNING_INTERVAL_MS;

const GAIN_MIN = 0.00025 * MAGNITUDE_SCALE; // 0.025% of capital per six hours
const GAIN_MAX = 0.00075 * MAGNITUDE_SCALE; // 0.075% of capital per six hours
const LOSS_MIN = 0.0004 * MAGNITUDE_SCALE; // 0.040% of capital per six hours
const LOSS_MAX = 0.001 * MAGNITUDE_SCALE; // 0.100% of capital per six hours

const UINT32_MAX = 0xffffffff;

/**
 * Unsigned 32-bit FNV-1a hash.
 *
 * Chosen over a seeded PRNG because there is no stream to advance and replay
 * here - every outcome is addressed directly by index, so a hash that maps a
 * key straight to a number is the simpler fit. The cumulative total still has
 * to be folded from index 0 forward (each step depends on the running sum
 * before it), but the gain/loss and magnitude of any individual outcome can
 * be computed on its own, in any order, without touching the others.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Whether the outcome at `outcomeIndex` is a gain.
 *
 * Outcomes are grouped into fixed cycles of twenty so the win rate is exact
 * rather than merely likely: within each cycle, every slot is ranked by a
 * hash of the flow id, the cycle, and the slot, and the thirteen
 * lowest-ranked slots are profitable. Ranking is what turns "roughly 65%"
 * into "exactly thirteen of twenty" without ever drawing a value that could
 * fail to land there.
 */
/*
 * The ranking is a property of the cycle, not of the slot - all twenty slots
 * in a cycle share one answer - so it is computed once and held until the
 * fold moves on to the next cycle.
 *
 * Without this, folding a flow re-ranked and re-sorted the same twenty slots
 * twenty times over, once per outcome. That was affordable only while
 * outcomes were six hours apart; at a five-minute interval a one-year-old
 * flow needs 105,120 outcomes, and the redundant work put a single history
 * request into the seconds. One cached cycle is enough because the fold walks
 * outcomes in ascending order and never revisits a cycle it has left.
 */
let cachedOrderSeedId: string | null = null;
let cachedOrderSeed = 0;

function orderSeed(flowId: string): number {
  if (flowId === cachedOrderSeedId) return cachedOrderSeed;
  cachedOrderSeedId = flowId;
  cachedOrderSeed = fnv1a(`${flowId}:order:`);
  return cachedOrderSeed;
}

/** Continue an FNV-1a fold with two integers, four bytes each. */
function mixInts(seed: number, a: number, b: number): number {
  let hash = seed;
  let first = a;
  let second = b;
  for (let byte = 0; byte < 4; byte++) {
    hash ^= first & 0xff;
    hash = Math.imul(hash, 0x01000193);
    first >>>= 8;
  }
  for (let byte = 0; byte < 4; byte++) {
    hash ^= second & 0xff;
    hash = Math.imul(hash, 0x01000193);
    second >>>= 8;
  }
  return hash >>> 0;
}

let cachedMaskKey = '';
let cachedMask = 0;

/** Bitmask of the profitable slots in one cycle. Twenty slots fit in an int. */
function profitMaskForCycle(flowId: string, cycle: number): number {
  const key = `${flowId}:${cycle}`;
  if (key === cachedMaskKey) return cachedMask;

  // Same trick as the magnitude hash: one hash of the flow prefix, then the
  // cycle and slot mixed in as bytes, so ranking a cycle allocates nothing.
  const seed = orderSeed(flowId);
  const ranked = Array.from({ length: CYCLE_SIZE }, (_, s) => ({
    slot: s,
    hash: mixInts(seed, cycle, s),
  })).sort((a, b) => a.hash - b.hash);

  let mask = 0;
  for (let rank = 0; rank < PROFITS_PER_CYCLE; rank++) {
    mask |= 1 << ranked[rank].slot;
  }

  cachedMaskKey = key;
  cachedMask = mask;
  return mask;
}

export function modelledOutcomeIsProfit(flowId: string, outcomeIndex: number): boolean {
  const cycle = Math.floor(outcomeIndex / CYCLE_SIZE);
  const slot = outcomeIndex - cycle * CYCLE_SIZE;
  return (profitMaskForCycle(flowId, cycle) & (1 << slot)) !== 0;
}

/*
 * The flow half of the magnitude key, hashed once per flow.
 *
 * Building `${flowId}:magnitude:${i}` per outcome allocated a string for
 * every one of them, which was the single largest cost left in a long fold.
 * FNV-1a is a running fold, so the flow prefix can be hashed once and the
 * index mixed into the result directly.
 */
let cachedSeedId: string | null = null;
let cachedSeed = 0;

function magnitudeSeed(flowId: string): number {
  if (flowId === cachedSeedId) return cachedSeed;
  cachedSeedId = flowId;
  cachedSeed = fnv1a(`${flowId}:magnitude:`);
  return cachedSeed;
}

/** The signed share of allocated capital that outcome `outcomeIndex` moves. */
function outcomeMagnitude(flowId: string, outcomeIndex: number, isProfit: boolean): number {
  // Mix the index in as four bytes, continuing the same FNV-1a fold the
  // prefix left off at, so each index still gets its own well-spread value.
  let hash = magnitudeSeed(flowId);
  let remaining = outcomeIndex;
  for (let byte = 0; byte < 4; byte++) {
    hash ^= remaining & 0xff;
    hash = Math.imul(hash, 0x01000193);
    remaining >>>= 8;
  }

  const unit = (hash >>> 0) / UINT32_MAX;
  return isProfit
    ? GAIN_MIN + unit * (GAIN_MAX - GAIN_MIN)
    : LOSS_MIN + unit * (LOSS_MAX - LOSS_MIN);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Creation time as epoch milliseconds, or NaN when it can't be established. */
function createdAtMs(createdAt: ModelledPnlInput['createdAt']): number {
  if (createdAt == null) return NaN;
  if (typeof createdAt === 'number') return createdAt;
  return createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
}

/**
 * Cumulative P&L at each of `sampleTimes`, in the currency `allocatedCapital`
 * is denominated in.
 *
 * Built by replaying completed intervals since creation and folding each
 * outcome into a running total, clamped to `[-allocatedCapital,
 * allocatedCapital]` after every single outcome rather than once at the end -
 * an unclamped intermediate could otherwise let one large step drag the total
 * past the bound and back within it, hiding a run of outcomes a trader should
 * see.
 *
 * Sample times are replayed in ascending order so the fold only moves
 * forward; the result at any one time depends solely on how many intervals
 * have completed by then; unsorted or duplicate input times are supported by
 * sorting internally and writing results back to their original positions.
 */
export function modelledPnlSeries(input: ModelledPnlInput): number[] {
  const { flowId, allocatedCapital, createdAt, sampleTimes } = input;

  if (sampleTimes.length === 0) return [];

  const createdMs = createdAtMs(createdAt);
  if (!Number.isFinite(allocatedCapital) || allocatedCapital <= 0 || !Number.isFinite(createdMs)) {
    return sampleTimes.map(() => 0);
  }

  const order = sampleTimes.map((time, index) => ({ time, index })).sort((a, b) => a.time - b.time);

  const results = new Array<number>(sampleTimes.length);
  let cumulative = 0;
  let completedIntervals = 0;

  for (const { time, index } of order) {
    const target = time < createdMs ? 0 : Math.floor((time - createdMs) / INTERVAL_MS);

    while (completedIntervals < target) {
      const isProfit = modelledOutcomeIsProfit(flowId, completedIntervals);
      const magnitude = outcomeMagnitude(flowId, completedIntervals, isProfit);
      cumulative += allocatedCapital * magnitude * (isProfit ? 1 : -1);
      cumulative = clamp(cumulative, -allocatedCapital, allocatedCapital);
      completedIntervals++;
    }

    results[index] = cumulative;
  }

  return results;
}

/** One flow's modelled P&L at a single instant. */
export function modelledPnlAt(
  input: Omit<ModelledPnlInput, 'sampleTimes'> & { at: number }
): number {
  return modelledPnlSeries({ ...input, sampleTimes: [input.at] })[0];
}
