/**
 * The canonical public origin, normalized once so callers never have to think
 * about trailing slashes.
 *
 * Same NEXT_PUBLIC_APP_URL and same localhost fallback the auth email routes
 * already use (src/app/api/auth/register/route.ts and friends), kept
 * deliberately identical so sitemap URLs and emailed links can never disagree
 * about what the site is called.
 *
 * Note the fallback is a real risk for SEO, not just a dev convenience: a
 * production deploy that forgets NEXT_PUBLIC_APP_URL will publish a sitemap
 * full of http://localhost:4028 URLs. Set it in your deployment environment.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028').replace(
  /\/+$/,
  ''
);
