/**
 * Deterministic performance model: capital-aware P&L, no randomness.
 *
 * This replaces a demo generator seeded from `Math.random()` with a pure
 * function of (flow id, allocated capital, creation time, sample time).
 * Given the same inputs it always returns the same figures, so a reload, a
 * server restart, or a second caller computing the portfolio total from the
 * same flows never disagrees with itself - the property `demo-mode.ts`
 * could not offer once anything depended on both a chart and an aggregate
 * derived from the same underlying flows.
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

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const CYCLE_SIZE = 20;
const PROFITS_PER_CYCLE = 13;

const GAIN_MIN = 0.00025; // 0.025% of allocated capital
const GAIN_MAX = 0.00075; // 0.075% of allocated capital
const LOSS_MIN = 0.0004; // 0.040% of allocated capital
const LOSS_MAX = 0.001; // 0.100% of allocated capital

const UINT32_MAX = 0xffffffff;

/**
 * Unsigned 32-bit FNV-1a hash.
 *
 * Chosen over a seeded PRNG (as `demo-mode.ts` uses) because there is no
 * stream to advance and replay here - every outcome is addressed directly by
 * index, so a hash that maps a key straight to a number is the simpler fit
 * and lets `modelledPnlAt` reproduce a single outcome without recomputing
 * everything before it.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A repeatable unit value in [0, 1] for one hash key. */
function unitValue(key: string): number {
  return fnv1a(key) / UINT32_MAX;
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
export function modelledOutcomeIsProfit(flowId: string, outcomeIndex: number): boolean {
  const cycle = Math.floor(outcomeIndex / CYCLE_SIZE);
  const slot = outcomeIndex - cycle * CYCLE_SIZE;

  const ranked = Array.from({ length: CYCLE_SIZE }, (_, s) => ({
    slot: s,
    hash: fnv1a(`${flowId}:order:${cycle}:${s}`),
  })).sort((a, b) => a.hash - b.hash);

  const rank = ranked.findIndex((entry) => entry.slot === slot);
  return rank < PROFITS_PER_CYCLE;
}

/** The signed share of allocated capital that outcome `outcomeIndex` moves. */
function outcomeMagnitude(flowId: string, outcomeIndex: number, isProfit: boolean): number {
  const unit = unitValue(`${flowId}:magnitude:${outcomeIndex}`);
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
