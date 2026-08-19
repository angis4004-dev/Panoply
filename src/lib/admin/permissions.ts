/**
 * The authority model for the admin console.
 *
 * Every gate in the admin surface asks this module a question about a
 * permission, never about a role. The previous system asked
 * `session.user.role !== 'Admin'` in twelve separate route handlers, which
 * meant "can review KYC" and "can move someone's money" were the same
 * question with the same answer - there was no way to hire a reviewer without
 * also handing them the ledger.
 *
 * Roles exist here only as a way of naming a default set of permissions plus
 * the small number of things a MainAdmin can do *because* they are the
 * MainAdmin. Everything else is a permission string, and permissions are
 * checked individually.
 *
 * Pure by design - no database, no request, no session. That is what makes the
 * hierarchy rules testable in isolation rather than reachable only by standing
 * up a server and holding two accounts.
 */

export type AdminRole = 'MainAdmin' | 'Admin';

/** Roles that exist in the product, including the non-admin one. */
export type PrincipalRole = AdminRole | 'Trader';

export const PERMISSIONS = [
  /** See the trader list and individual trader accounts. */
  'trader.read',
  /** Create a trader account from the console. */
  'trader.create',
  /** Edit trader profile fields. */
  'trader.update',
  /** Suspend or reactivate a trader. */
  'trader.suspend',

  /** See the KYC queue and masked submission data. */
  'kyc.read',
  /** Approve or reject a submission, and view the identity document. */
  'kyc.review',

  /** See the chain catalog: which networks exist and their address rules. */
  'network.read',
  /**
   * Add a network, change its address rule, or switch deposits and
   * withdrawals on and off for it. Deliberately separate from
   * deposit_address.manage: publishing an address decides where funds land on
   * a chain the platform already trusts, whereas this decides which chains
   * exist at all and what counts as a valid address on them. Someone who can
   * loosen an address rule can make a wrong-chain payout pass validation.
   */
  'network.manage',

  /** See deposit addresses assigned across the platform. */
  'deposit_address.read',
  /** Assign, deactivate, and rotate deposit addresses. */
  'deposit_address.manage',

  /** See the deposit authorization queue. */
  'deposit.read',
  /**
   * Authorize a pending deposit, which credits a trader through the ledger.
   * Grantable to an Admin, but only by explicit grant - it is not part of the
   * Admin role's default set.
   */
  'deposit.authorize',

  /** See the withdrawal queue. */
  'withdrawal.read',
  /**
   * Decide a withdrawal: approve it, refuse it, or mark an approved one paid.
   *
   * Approving debits the trader's wallet, so this is money movement and is
   * granted explicitly rather than coming with the Admin role. Rejecting moves
   * nothing, but it is bundled here because an operator working the queue needs
   * both halves - the same reasoning that keeps deposit.authorize single.
   */
  'withdrawal.review',

  /**
   * Post a manual ledger adjustment against a trader's wallet. Grantable, but
   * deliberately separate from deposit.authorize: authorizing a deposit that
   * has blockchain evidence behind it is a different act from inventing a
   * balance movement.
   */
  'ledger.adjust',

  /** See the trading controls: the kill switch, the limits, and the venue. */
  'trading.read',
  /**
   * Engage the kill switch - stop all trading.
   *
   * Grantable, and deliberately easy to hold. Halting is the safe direction:
   * the worst outcome of a halt nobody needed is that no orders are placed for
   * a while. Requiring the MainAdmin to be awake before anything can be
   * stopped would be the more dangerous design.
   */
  'trading.halt',
  /**
   * Lift the halt and change the risk limits.
   *
   * The other half of the switch, and MainAdmin-only. Resuming trading and
   * raising a ceiling are the two actions here that can cause money to move,
   * and neither is urgent in the way stopping is. See MAIN_ADMIN_ONLY.
   */
  'trading.manage',

  /** Read the audit log. */
  'audit.read',

  /** See the admin roster. */
  'admin.read',
  /** Create new admin accounts. */
  'admin.create',
  /** Suspend, reactivate, and change the permissions of other admins. */
  'admin.manage',

  /** Platform-level configuration: strategy templates, model registry. */
  'platform.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * Permissions that cannot be delegated, at all, to an Admin.
 *
 * These are the ones that would let a delegate rewrite the hierarchy that
 * constrains them: create another admin, alter an admin's permissions, or
 * reach platform configuration. If any of these were grantable, "Admin cannot
 * create a MainAdmin" would hold only until a MainAdmin ticked the wrong box
 * once.
 */
export const MAIN_ADMIN_ONLY: readonly Permission[] = [
  'admin.create',
  'admin.manage',
  'platform.manage',
  /*
   * Resuming trading and raising a risk ceiling both end with customer money
   * at the venue. Its counterpart trading.halt is grantable, and that
   * asymmetry is the design: anyone trusted enough to watch the platform can
   * stop it, only the MainAdmin can start it again.
   */
  'trading.manage',
];

/**
 * What an Admin gets on the day they are created.
 *
 * Reviewing identity documents and looking at accounts - the work the role
 * exists for. Nothing here moves money.
 */
export const ADMIN_DEFAULT_PERMISSIONS: readonly Permission[] = [
  'trader.read',
  'kyc.read',
  'kyc.review',
  'network.read',
  'deposit_address.read',
  'deposit.read',
  'withdrawal.read',
  // Seeing whether the platform is trading is not authority over it, and an
  // admin who cannot tell that trading is halted will misread every other
  // screen in the console.
  'trading.read',
  'audit.read',
  'admin.read',
];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/** True when a MainAdmin is allowed to hand this permission to an Admin. */
export function isGrantable(permission: Permission): boolean {
  return !MAIN_ADMIN_ONLY.includes(permission);
}

/** The permissions a MainAdmin may add to an Admin, in a stable order. */
export function grantablePermissions(): Permission[] {
  return ALL_PERMISSIONS.filter(isGrantable);
}

export interface AdminPrincipal {
  id: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'suspended';
  /** Extra permissions granted on top of the role's defaults. */
  grantedPermissions: string[];
}

/**
 * The permissions a principal actually holds, right now.
 *
 * A MainAdmin holds everything - that is what the role means, and enumerating
 * it rather than special-casing `role === 'MainAdmin'` at each call site keeps
 * every gate a permission check.
 *
 * A suspended admin holds nothing. Suspension has to mean something even if a
 * live session survives the moment it is applied.
 *
 * Grants are intersected with the grantable set on read, not only on write.
 * A row that somehow acquired 'admin.manage' - a bad migration, a direct
 * database edit - does not become authority just because it is stored.
 */
export function effectivePermissions(principal: AdminPrincipal): Permission[] {
  if (principal.status !== 'active') return [];
  if (principal.role === 'MainAdmin') return [...ALL_PERMISSIONS];

  const granted = principal.grantedPermissions.filter(
    (value): value is Permission => isPermission(value) && isGrantable(value)
  );

  return ALL_PERMISSIONS.filter(
    (permission) => ADMIN_DEFAULT_PERMISSIONS.includes(permission) || granted.includes(permission)
  );
}

export function hasPermission(principal: AdminPrincipal, permission: Permission): boolean {
  return effectivePermissions(principal).includes(permission);
}

export interface AuthorityDecision {
  allowed: boolean;
  /** Present when `allowed` is false. Safe to show to the acting admin. */
  reason?: string;
}

const ALLOWED: AuthorityDecision = { allowed: true };

function denied(reason: string): AuthorityDecision {
  return { allowed: false, reason };
}

export interface AdminTarget {
  id: string;
  role: AdminRole;
  status: 'active' | 'suspended';
}

/**
 * Whether `actor` may create an admin account with the given role.
 *
 * Only a MainAdmin creates admins, and creating a second MainAdmin is refused
 * outright. The single MainAdmin is established by scripts/bootstrap-admin.mjs,
 * which is environment-controlled and needs deploy access; if promotion to
 * MainAdmin were available through the console then compromising one admin
 * session would be enough to mint permanent top-level authority.
 */
export function canCreateAdmin(actor: AdminPrincipal, role: AdminRole): AuthorityDecision {
  if (!hasPermission(actor, 'admin.create')) {
    return denied('Only the MainAdmin can create admin accounts.');
  }
  if (role === 'MainAdmin') {
    return denied(
      'MainAdmin accounts cannot be created from the console. Use the environment-controlled bootstrap.'
    );
  }
  return ALLOWED;
}

/**
 * Whether `actor` may change `target` - suspend, reactivate, or alter
 * permissions.
 *
 * Three rules, each one a thing that went wrong somewhere before:
 * an Admin cannot reach admin management at all; nobody may act on the
 * MainAdmin through this path; and no admin may suspend themselves, which is
 * an easy accident and locks the console.
 */
export function canManageAdmin(actor: AdminPrincipal, target: AdminTarget): AuthorityDecision {
  if (!hasPermission(actor, 'admin.manage')) {
    return denied('Only the MainAdmin can manage admin accounts.');
  }
  if (target.role === 'MainAdmin') {
    return denied('The MainAdmin account cannot be modified from the console.');
  }
  if (actor.id === target.id) {
    return denied('An admin cannot modify their own account.');
  }
  return ALLOWED;
}

/**
 * Whether `actor` may set `target`'s granted permissions to `next`.
 *
 * Rejects the whole set rather than silently dropping the offending entries.
 * A permission form that quietly discards half of what was submitted reports
 * success for a state that was never applied, and the next person to read the
 * screen believes it.
 */
export function canSetPermissions(
  actor: AdminPrincipal,
  target: AdminTarget,
  next: string[]
): AuthorityDecision {
  const manage = canManageAdmin(actor, target);
  if (!manage.allowed) return manage;

  for (const value of next) {
    if (!isPermission(value)) {
      return denied(`Unknown permission: ${value}`);
    }
    if (!isGrantable(value)) {
      return denied(`${value} is reserved to the MainAdmin and cannot be granted.`);
    }
  }
  return ALLOWED;
}

/**
 * A Trader is never a principal in the admin console.
 *
 * This exists so that "a trader session grants no admin authority" is an
 * assertion something can be written against, rather than an absence that a
 * future refactor could quietly fill in.
 */
export function isAdminRole(role: unknown): role is AdminRole {
  return role === 'MainAdmin' || role === 'Admin';
}
