// Server-only by construction: next/headers throws if this is ever imported
// into a client component, which is a louder failure than the `server-only`
// package would give and does not add a dependency for it.
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { resolveAdminSession, type AdminSessionContext } from './session';
import { hasPermission, type Permission } from './permissions';
import { classifyHost, hostConfigFromEnv, isAdminHostConfigured } from './host';

/**
 * The page-rendering counterpart to requireAdmin.
 *
 * Server components cannot return a NextResponse, so this redirects or 404s
 * instead. The checks are the same and in the same order, and it is called at
 * the top of every console page rather than only in the layout - a layout
 * guard is not a guard, because Next renders a page and its layout in
 * parallel and a client-side navigation can reuse a cached layout without
 * re-running it.
 */

export interface AdminPageContext extends AdminSessionContext {
  can: (permission: Permission) => boolean;
}

export async function requireAdminPage(permission?: Permission): Promise<AdminPageContext> {
  const headerList = await headers();
  const config = hostConfigFromEnv();

  if (classifyHost(headerList.get('host'), config) !== 'admin') {
    notFound();
  }
  if (process.env.NODE_ENV === 'production' && !isAdminHostConfigured(config)) {
    console.error('ADMIN_HOST is not configured; refusing to render the admin console.');
    notFound();
  }

  const session = await resolveAdminSession({ headers: headerList as unknown as Headers });
  if (!session) redirect('/admin/login');

  // An account with provisional credentials sees one screen until it fixes
  // them. Checked before the permission test so the message is "finish setting
  // up" rather than a misleading "you lack permission".
  if (session.admin.mustChangePassword || session.admin.mustSetPin) {
    redirect('/admin/account?setup=1');
  }

  if (permission && !hasPermission(session.admin, permission)) {
    // Not a 403 page. Sending the operator somewhere they can actually work
    // beats a dead end, and the console's navigation already hides what they
    // cannot reach - arriving here means a bookmark or a typed URL.
    redirect('/admin?denied=' + encodeURIComponent(permission));
  }

  return {
    ...session,
    can: (value: Permission) => hasPermission(session.admin, value),
  };
}

/**
 * The same, without the good-standing redirect. Used only by the account page,
 * which is where an admin resolves an outstanding password change.
 */
export async function requireAdminPageForSetup(): Promise<AdminPageContext> {
  const headerList = await headers();
  const config = hostConfigFromEnv();

  if (classifyHost(headerList.get('host'), config) !== 'admin') notFound();
  if (process.env.NODE_ENV === 'production' && !isAdminHostConfigured(config)) notFound();

  const session = await resolveAdminSession({ headers: headerList as unknown as Headers });
  if (!session) redirect('/admin/login');

  return {
    ...session,
    can: (value: Permission) => hasPermission(session.admin, value),
  };
}
