import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

/**
 * Crawl policy. The disallow list mirrors what middleware.ts already protects,
 * plus the single-use token flows - those are unreachable to a crawler anyway,
 * but keeping them out avoids reset/verification URLs ever showing up in an
 * index if one is shared publicly.
 *
 * /api is disallowed for crawl budget, not security: the routes enforce their
 * own auth, and robots.txt is a request, not an access control.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard/',
        '/admin/',
        '/reset-password',
        '/forgot-password',
        '/verify-email',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
