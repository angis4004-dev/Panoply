import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

/**
 * Routes we want indexed. Deliberately hand-listed rather than globbed off the
 * filesystem: app/ also contains dashboard, admin, and token-bearing auth
 * pages, and a glob would happily publish all of them.
 *
 * Excluded on purpose:
 * - /dashboard/**, /admin - behind middleware auth, nothing to crawl
 * - /forgot-password, /reset-password, /verify-email - single-use token flows
 * - /sign-up-login-screen - reachable from every page's CTA; indexing a login
 *   form adds no search value and competes with the landing page
 *
 * `priority` is relative within this file only; search engines treat it as a
 * weak hint. `changeFrequency` likewise.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const marketing = ['', '/signal-flows', '/charts', '/tiers', '/about', '/security'].map(
    (path, i) => ({
      url: `${SITE_URL}${path}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: i === 0 ? 1 : 0.8,
    })
  );

  const reference = ['/terms', '/privacy', '/disclaimer'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.3,
  }));

  return [...marketing, ...reference];
}
