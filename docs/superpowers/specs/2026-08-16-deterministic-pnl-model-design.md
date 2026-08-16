# Deterministic portfolio P&L model

## Goal

Replace the dashboard's actual-fill-only portfolio and old demo P&L paths with
one deterministic, capital-aware 65/35 performance model. The chart, flow
figures, and dashboard Realized P&L summary must calculate the same value for
the same flows at the same instant.

This model intentionally represents calculated performance, not venue-recorded
or ledger-settled P&L. It must not affect wallet balances, allocations, or
settlement.

## Model

Create a pure module under `src/lib` that accepts a flow ID, allocated capital,
creation time, and requested sample timestamps.

- A flow has no modelled performance before its creation time or with zero
  allocation.
- Outcomes occur at fixed six-hour intervals after creation. This lets all
  supported chart ranges show discrete movement without interpolation.
- Every consecutive group of 20 outcomes contains exactly 13 gains and 7
  losses. A stable hash of the flow ID chooses the sequence's phase/order.
- A stable hash of flow ID and outcome index varies the magnitude within small,
  bounded positive and negative percentage ranges of allocated capital.
- Values are cumulative, rounded only at API presentation boundaries, and
  bounded so losses cannot exceed the allocated capital.
- There is no `Math.random()`, environment switch, demo module dependency,
  generated banner, or fallback to a historical random walk.

## Integration

`/api/portfolio/history` will obtain each funded flow's modelled series and sum
it point-by-point. It preserves authentication, dashboard unlock, database
connection, user filtering, date-range parsing, sampling, allocated capital,
funded flow counting, and error handling.

`/api/bots` will sample the same module at one shared `Date.now()` instant for
all flows. It will return the calculated P&L and percentage used by the
existing dashboard cards. It will remove only the old demo P&L dependencies
and fields from this flow-P&L path.

The existing Metrics Bento grid sums flow P&L from `/api/bots`, so its Realized
P&L value will equal the portfolio history endpoint's latest point when both
sample the same instant. Six-hour outcome boundaries also prevent a small
request-timing difference from creating a normal discrepancy.

## Tests

Add unit tests for:

1. Exactly 13 gains and 7 losses in each twenty-outcome cycle.
2. Repeatability for equal inputs and independent sequences for different flow
   IDs.
3. Zero allocation and pre-creation timestamps producing zero.
4. Gains increasing, losses decreasing, and correct cumulative arithmetic.
5. Per-flow allocation-aware bounds and portfolio aggregation.
6. A flow's current-value calculation matching the final value of its sampled
   chart series.

Run `npm test`, `npm run type-check`, `npm run lint`, and `npm run build`.
Only failures caused by this implementation will be fixed.
