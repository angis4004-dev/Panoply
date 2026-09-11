import { describe, it, expect } from 'vitest';
import { selectKycReviewers } from '@/lib/admin/kyc-reviewers';
import type { AdminPrincipal } from '@/lib/admin/permissions';

/**
 * Who is addressed, and who is not. The list decides whether a submission is
 * seen by someone who can act on it, and every wrong answer is silent: an
 * alert to a suspended account, or none at all.
 */

const admin = (overrides: Partial<AdminPrincipal> = {}): AdminPrincipal => ({
  id: 'a1',
  email: 'reviewer@panoply.finance',
  role: 'Admin',
  status: 'active',
  grantedPermissions: [],
  ...overrides,
});

describe('selectKycReviewers', () => {
  it('includes an active delegate admin, who holds kyc.review by default', () => {
    expect(selectKycReviewers([admin()])).toEqual(['reviewer@panoply.finance']);
  });

  it('leaves out the main admin, whose whole point is not doing this work', () => {
    expect(
      selectKycReviewers([admin({ role: 'MainAdmin', email: 'owner@panoply.finance' })])
    ).toEqual([]);
  });

  it('leaves out a suspended admin', () => {
    // effectivePermissions returns nothing for a suspended principal, so this
    // holds even though the role would otherwise carry kyc.review.
    expect(selectKycReviewers([admin({ status: 'suspended' })])).toEqual([]);
  });

  it('normalises and dedupes addresses', () => {
    const list = selectKycReviewers([
      admin({ id: 'a1', email: '  Reviewer@Panoply.Finance ' }),
      admin({ id: 'a2', email: 'reviewer@panoply.finance' }),
      admin({ id: 'a3', email: 'second@panoply.finance' }),
    ]);
    expect(list).toEqual(['reviewer@panoply.finance', 'second@panoply.finance']);
  });

  it('returns nobody when there are no admins at all', () => {
    expect(selectKycReviewers([])).toEqual([]);
  });
});
