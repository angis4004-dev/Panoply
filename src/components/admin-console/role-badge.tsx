import React from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminRole } from '@/lib/admin/permissions';

/**
 * The one place the hierarchy is drawn.
 *
 * MainAdmin wears the brand's cream `primary`, which nothing else in the
 * console uses for status. Admin wears the neutral surface treatment. That is
 * a deliberate scarcity: if two roles both got a coloured chip, an operator
 * would have to read the word to tell them apart, and the word is the thing
 * they stop reading after the fiftieth row.
 *
 * The icons say the same thing twice, for anyone who cannot rely on the
 * colour: a key for the account that holds the keys, a shield for the account
 * that reviews. Never colour alone.
 */

const ROLE_STYLES: Record<AdminRole, { className: string; Icon: typeof KeyRound }> = {
  MainAdmin: {
    className: 'border-primary/35 bg-primary/12 text-primary',
    Icon: KeyRound,
  },
  Admin: {
    className: 'border-ds-border-strong bg-ds-surface-inset text-ds-text-secondary',
    Icon: ShieldCheck,
  },
};

export function RoleBadge({
  role,
  className,
  showIcon = true,
}: {
  role: AdminRole | string;
  className?: string;
  showIcon?: boolean;
}) {
  const style = ROLE_STYLES[role as AdminRole] ?? ROLE_STYLES.Admin;
  const { Icon } = style;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-ds-caption font-semibold',
        style.className,
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {role}
    </span>
  );
}

/**
 * What each role actually is, in one sentence, for the places an operator is
 * deciding something about it.
 *
 * Kept next to the badge so the wording cannot drift between the admins page,
 * the account page, and the create-admin form.
 */
export const ROLE_SUMMARY: Record<AdminRole, string> = {
  MainAdmin:
    'Holds every permission and is the only account that can create or manage other admins. Established by the environment-controlled bootstrap, never from this console.',
  Admin:
    'Reviews KYC and reads accounts by default. Anything that moves money is an explicit grant from the MainAdmin, and admin management can never be granted at all.',
};
