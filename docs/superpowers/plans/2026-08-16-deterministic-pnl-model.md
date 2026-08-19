# Deterministic P&L Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Drive portfolio history, Signal Flow P&L, and the dashboard Realized P&L card from one deterministic, capital-aware 65/35 outcome model.

**Architecture:** Create a pure \`performance-model\` module with six-hour outcome intervals. Each 20-outcome cycle has exactly 13 gains and 7 losses, with a stable hash of the flow ID defining both the outcome order and varied magnitude. Both API routes call this module; the existing metric grid continues to sum the flow values returned by \`/api/bots\`.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, MongoDB/Mongoose.

**Spec:** \`docs/superpowers/specs/2026-08-16-deterministic-pnl-model-design.md\`

## Global Constraints

- Never use \`Math.random()\`, \`demo-mode\`, \`demoPnlSeries\`, \`demoFlowPnl\`, \`demoWinRate\`, \`flowStartMs\`, \`isDemoMode\`, or \`DEMO_BANNER\` in the calculated P&L path.
- Use 13 profitable and 7 losing outcomes in every 20-outcome cycle.
- Return zero before creation and for non-finite or non-positive allocated capital.
- Base every outcome on allocated capital, and clamp cumulative P&L to \`[-allocatedCapital, allocatedCapital]\`.
- Do not mutate wallet, ledger, allocation, or settlement state.
- Preserve authentication, unlock protection, database/user filtering, range/point parsing, allocation/funding counters, and error handling.
- Run \`npm test\`, \`npm run type-check\`, \`npm run lint\`, and \`npm run build\`; fix only implementation-caused failures.

---

## File Structure

- Create \`src/lib/performance-model.ts\`: pure deterministic outcome scheduler and cumulative P&L functions.
- Create \`src/lib/performance-model.test.ts\`: model distribution, determinism, start date, bounds, aggregation, and chart/summary parity tests.
- Modify \`src/app/api/portfolio/history/route.ts\`: aggregate the shared model.
- Modify \`src/app/api/bots/route.ts\`: expose shared calculated P&L for every Signal Flow and remove its old demo-P&L path.
- Modify \`src/app/(site)/dashboard/components/PnLAreaChart.tsx\`: remove stale demo response handling.

### Task 1: Add the pure deterministic model

**Files:**
- Create: \`src/lib/performance-model.ts\`
- Test: \`src/lib/performance-model.test.ts\`

**Interfaces:**
- Produces \`modelledPnlSeries(input: ModelledPnlInput): number[]\`.
- Produces \`modelledPnlAt(input: Omit<ModelledPnlInput, 'sampleTimes'> & { at: number }): number\`.
- Produces \`modelledOutcomeIsProfit(flowId: string, outcomeIndex: number): boolean\`.

- [ ] **Step 1: Write the failing tests**

\`\`\`ts
import { describe, expect, it } from 'vitest';
import { modelledOutcomeIsProfit, modelledPnlAt, modelledPnlSeries } from './performance-model';

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);

describe('deterministic performance model', () => {
  it('has exactly thirteen gains in each twenty-outcome cycle', () => {
    for (const first of [0, 20, 40]) {
      const gains = Array.from({ length: 20 }, (_, i) =>
        modelledOutcomeIsProfit('flow-a', first + i)
      ).filter(Boolean).length;
      expect(gains).toBe(13);
    }
  });

  it('is deterministic, flow-specific, capital-aware, and zero before creation', () => {
    const input = { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START, at: START + 48 * HOUR };
    expect(modelledPnlAt(input)).toBe(modelledPnlAt(input));
    expect(modelledPnlAt({ ...input, flowId: 'flow-b' })).not.toBe(modelledPnlAt(input));
    expect(modelledPnlAt({ ...input, allocatedCapital: 0 })).toBe(0);
    expect(modelledPnlAt({ ...input, at: START - HOUR })).toBe(0);
  });

  it('returns cumulative values with gains and losses and a matching final value', () => {
    const sampleTimes = Array.from({ length: 21 }, (_, i) => START + i * 6 * HOUR);
    const input = { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START, sampleTimes };
    const series = modelledPnlSeries(input);
    const deltas = series.slice(1).map((value, i) => value - series[i]);
    expect(series[0]).toBe(0);
    expect(deltas.some((value) => value > 0)).toBe(true);
    expect(deltas.some((value) => value < 0)).toBe(true);
    expect(series.at(-1)).toBe(modelledPnlAt({ ...input, at: sampleTimes.at(-1)! }));
  });

  it('aggregates the same as the sum of flow current values', () => {
    const sampleTimes = [START, START + 6 * HOUR, START + 12 * HOUR];
    const flows = [
      { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START },
      { flowId: 'flow-b', allocatedCapital: 500, createdAt: START + 3 * HOUR },
    ];
    const total = flows.reduce(
      (sum, flow) => sum + modelledPnlAt({ ...flow, at: sampleTimes.at(-1)! }),
      0
    );
    const fromSeries = flows.reduce(
      (sum, flow) => sum + modelledPnlSeries({ ...flow, sampleTimes }).at(-1)!,
      0
    );
    expect(fromSeries).toBe(total);
  });
});
\`\`\`

- [ ] **Step 2: Run the test and verify RED**

Run: \`npm test -- src/lib/performance-model.test.ts\`

Expected: failure resolving \`./performance-model\`.

- [ ] **Step 3: Implement the smallest pure model**

\`\`\`ts
export interface ModelledPnlInput {
  flowId: string;
  allocatedCapital: number;
  createdAt: Date | string | number | null | undefined;
  sampleTimes: number[];
}

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const CYCLE_SIZE = 20;
const PROFITS_PER_CYCLE = 13;

export function modelledOutcomeIsProfit(flowId: string, outcomeIndex: number): boolean {
  // Rank all slots by stable hash of flow ID, cycle, and slot.
  // The first 13 ranks are profitable.
}

export function modelledPnlSeries(input: ModelledPnlInput): number[] {
  // Replay completed intervals, vary gain in [0.025%, 0.075%] and loss in
  // [0.040%, 0.100%] of allocated capital, then clamp after every result.
}

export function modelledPnlAt(
  input: Omit<ModelledPnlInput, 'sampleTimes'> & { at: number }
): number {
  return modelledPnlSeries({ ...input, sampleTimes: [input.at] })[0];
}
\`\`\`

Use an unsigned FNV-1a hash. For each sample, count completed intervals with \`Math.floor((sampleAt - createdAtMs) / INTERVAL_MS)\`; a sample at creation therefore returns zero. Derive a unit value in \`[0, 1]\` from \`hash(\`\${flowId}:magnitude:\${outcomeIndex}\`)\`, use it to vary the matching gain/loss range, and cache/replay outcomes sequentially for sorted sample times.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: \`npm test -- src/lib/performance-model.test.ts\`

Expected: all tests pass.

- [ ] **Step 5: Commit the model**

\`\`\`bash
git add src/lib/performance-model.ts src/lib/performance-model.test.ts
git commit -m "feat: add deterministic pnl performance model"
\`\`\`

### Task 2: Drive history from the model

**Files:**
- Modify: \`src/app/api/portfolio/history/route.ts:1-150\`
- Test: \`src/lib/performance-model.test.ts\`

**Interfaces:**
- Consumes \`modelledPnlSeries({ flowId, allocatedCapital, createdAt, sampleTimes })\`.
- Produces the unchanged \`{ from, to, allocatedCapital, fundedFlows, points }\` history response.

- [ ] **Step 1: Extend the aggregation test for a creation time inside the requested range**

\`\`\`ts
it('keeps samples before a later-created flow at zero', () => {
  const sampleTimes = [START, START + 6 * HOUR, START + 12 * HOUR];
  const series = modelledPnlSeries({
    flowId: 'late-flow',
    allocatedCapital: 500,
    createdAt: START + 9 * HOUR,
    sampleTimes,
  });
  expect(series).toEqual([0, 0, 0]);
});
\`\`\`

- [ ] **Step 2: Run the focused tests**

Run: \`npm test -- src/lib/performance-model.test.ts\`

Expected: pass after the Task 1 implementation.

- [ ] **Step 3: Replace the history route's series source**

\`\`\`ts
import { modelledPnlSeries } from '@/lib/performance-model';

const series = modelledPnlSeries({
  flowId: String(bot._id),
  allocatedCapital: allocated,
  createdAt: bot.createdAt,
  sampleTimes,
});
\`\`\`

Remove the \`realizedPnlSeries\` import and comments claiming the route replays actual fills. Keep the funded-flow filter, allocation totals, aggregation loop, and all guards/error handling unchanged.

- [ ] **Step 4: Verify type-check and focused tests**

Run: \`npm run type-check; npm test -- src/lib/performance-model.test.ts\`

Expected: both exit zero.

- [ ] **Step 5: Commit the history integration**

\`\`\`bash
git add src/app/api/portfolio/history/route.ts src/lib/performance-model.test.ts
git commit -m "feat: model portfolio history pnl"
\`\`\`

### Task 3: Share the model with Signal Flow summary values

**Files:**
- Modify: \`src/app/api/bots/route.ts:1-115\`
- Modify: \`src/app/(site)/dashboard/components/PnLAreaChart.tsx:250-285,467-471\`
- Modify: \`src/store/app-store.tsx:10-35\` only if API response typing requires it.
- Test: \`src/lib/performance-model.test.ts\`

**Interfaces:**
- Consumes \`modelledPnlAt({ flowId, allocatedCapital, createdAt, at })\`.
- Produces matching \`pnl\`, \`pnlDollar\`, and \`realizedPnlDollar\` flow fields.

- [ ] **Step 1: Add a same-instant parity test**

\`\`\`ts
it('matches the chart final sample at the summary sampling instant', () => {
  const at = START + 30 * HOUR;
  const flow = { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START };
  const chart = modelledPnlSeries({ ...flow, sampleTimes: [START, at] });
  expect(modelledPnlAt({ ...flow, at })).toBe(chart.at(-1));
});
\`\`\`

- [ ] **Step 2: Run the focused test**

Run: \`npm test -- src/lib/performance-model.test.ts\`

Expected: pass once Task 1 is complete.

- [ ] **Step 3: Replace the bots route demo P&L branch**

\`\`\`ts
import { modelledPnlAt } from '@/lib/performance-model';

const modelledDollar = modelledPnlAt({
  flowId: String(bot._id),
  allocatedCapital: allocated,
  createdAt: bot.createdAt,
  at: sampledAt,
});
const modelledPercent = allocated > 0 ? (modelledDollar / allocated) * 100 : 0;
\`\`\`

Remove the \`demo-mode\` import; \`demo\`, \`winRate\`, \`demoDollar\`, and \`demoPercent\`; and all conditionals and response fields based on them. Keep \`computeFlowPnl\` solely for actual position details: market value, unrealized P&L, never-traded state, and operational details. Return \`pnl\`, \`pnlDollar\`, and \`realizedPnlDollar\` from \`modelledDollar\` and \`modelledPercent\`.

Remove \`demoNotice\` state, response typing, setter, and banner JSX from \`PnLAreaChart\`. Do not introduce client-side animation or interpolation.

- [ ] **Step 4: Run tests, type-check, and lint**

Run: \`npm test; npm run type-check; npm run lint\`

Expected: no test/type/lint errors.

- [ ] **Step 5: Commit the shared integration**

\`\`\`bash
git add src/app/api/bots/route.ts src/app/(site)/dashboard/components/PnLAreaChart.tsx src/store/app-store.tsx src/lib/performance-model.test.ts
git commit -m "feat: share modelled pnl across dashboard"
\`\`\`

### Task 4: Verify the complete feature

**Files:**
- Review: \`src/lib/performance-model.ts\`
- Review: \`src/app/api/portfolio/history/route.ts\`
- Review: \`src/app/api/bots/route.ts\`

- [ ] **Step 1: Check that old demo P&L symbols and uncontrolled randomness are absent**

Run: \`rg -n "demoPnlSeries|demoFlowPnl|demoWinRate|flowStartMs|isDemoMode|DEMO_BANNER|Math\\.random" src/lib/performance-model.ts src/app/api/portfolio/history/route.ts src/app/api/bots/route.ts\`

Expected: no matches.

- [ ] **Step 2: Check the changed files for whitespace errors**

Run: \`git diff --check -- src/lib/performance-model.ts src/lib/performance-model.test.ts src/app/api/portfolio/history/route.ts src/app/api/bots/route.ts src/app/(site)/dashboard/components/PnLAreaChart.tsx\`

Expected: no output.

- [ ] **Step 3: Run the required suite**

Run: \`npm test; npm run type-check; npm run lint; npm run build\`

Expected: every command exits zero. Record existing warnings without editing unrelated files.

- [ ] **Step 4: Commit only final P&L integration fixes**

\`\`\`bash
git add src/lib/performance-model.ts src/lib/performance-model.test.ts src/app/api/portfolio/history/route.ts src/app/api/bots/route.ts src/app/(site)/dashboard/components/PnLAreaChart.tsx src/store/app-store.tsx
git commit -m "test: verify deterministic pnl model"
\`\`\`

