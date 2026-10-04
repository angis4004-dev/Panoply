import { describe, expect, it } from 'vitest';
import { computeTier, effectiveSlotLimit, TIER_SLOT_LIMITS } from './engine';

/**
 * effectiveSlotLimit decides whether an account may open a signal flow at all,
 * and both the create endpoint and the modal that fronts it read it. The two
 * have to agree: a grant honoured in one and not the other either blocks a
 * trader the server would have accepted, or offers a form the server refuses.
 */
describe('effectiveSlotLimit', () => {
  it('gives an account its tier allowance when there is no grant', () => {
    expect(effectiveSlotLimit('unverified')).toBe(0);
    expect(effectiveSlotLimit('novice')).toBe(1);
    expect(effectiveSlotLimit('amateur')).toBe(3);
    expect(effectiveSlotLimit('strategist')).toBe(6);
    expect(effectiveSlotLimit('vanguard')).toBe(Infinity);
  });

  it('treats null and undefined as no grant', () => {
    expect(effectiveSlotLimit('unverified', null)).toBe(0);
    expect(effectiveSlotLimit('unverified', undefined)).toBe(0);
  });

  it('opens a slot for an unverified account that was granted one', () => {
    expect(effectiveSlotLimit('unverified', 1)).toBe(1);
  });

  it('never lowers an allowance the tier already earned', () => {
    // The case this exists for: someone granted a slot while unverified, who
    // then verifies and deposits their way to Amateur. The grant must not
    // become the ceiling it was never meant to be.
    expect(effectiveSlotLimit('amateur', 1)).toBe(3);
    expect(effectiveSlotLimit('vanguard', 2)).toBe(Infinity);
  });

  it('ignores a grant that cannot mean anything', () => {
    for (const grant of [0, -1, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      expect(effectiveSlotLimit('novice', grant)).toBe(1);
    }
  });

  it('cannot be used to take an account below zero', () => {
    expect(effectiveSlotLimit('unverified', -5)).toBe(0);
  });
});

describe('computeTier is unmoved by a grant', () => {
  it('still reports unverified for an account that has only been granted a slot', () => {
    // A grant is an operator's decision, not evidence the trader verified or
    // deposited anything. Tier is shown to the user as progress they made, so
    // the two are kept apart on purpose.
    const tier = computeTier('unverified', 0);
    expect(tier).toBe('unverified');
    expect(TIER_SLOT_LIMITS[tier]).toBe(0);
    expect(effectiveSlotLimit(tier, 1)).toBe(1);
  });
});
