import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: import.meta.dirname,
  productionBrowserSourceMaps: true,
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: true,
  },
  distDir: process.env.DIST_DIR || '.next',
  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },
  async redirects() {
    return [
      /*
       * Retirement of the locale-prefixed URLs.
       *
       * /es, /ja, /ar and the rest were live on the deployed site for a short
       * window before the translated routes were withdrawn in favour of
       * letting the browser translate. Anything that crawled or bookmarked
       * them in that window would otherwise hit a 404 now.
       *
       * 308 rather than 302: these paths are never coming back under this
       * design, so the permanent form is the honest one and lets search
       * engines fold the ranking into the canonical URL.
       *
       * The two-rule split covers /ja and /ja/charts separately - a single
       * pattern cannot express "prefix alone, or prefix plus a path" while
       * keeping the tail for the second case.
       */
      {
        source: '/:locale(es|fr|de|it|ar|ja|zh|ko|en)',
        destination: '/',
        permanent: true,
      },
      {
        source: '/:locale(es|fr|de|it|ar|ja|zh|ko|en)/:path*',
        destination: '/:path*',
        permanent: true,
      },
    ];
  },

  /**
   * Cache-Control for the admin console, set here rather than only in the
   * proxy.
   *
   * src/proxy.ts sets no-store on every admin response, but Next replaces
   * Cache-Control on its own page responses afterwards, so a page that is
   * prerendered - or that becomes prerendered later - ends up cacheable
   * despite it. A header declared in the config is applied to the final
   * response and survives that.
   *
   * Every page under /admin is authenticated account data. A shared cache, a
   * CDN, or a back/forward restore showing the previous operator's queue is
   * not acceptable on this surface. These paths do not exist on the trader
   * host at all - the proxy 404s them - so scoping by path is enough.
   */
  async headers() {
    const noStore = [
      { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ];
    return [
      { source: '/admin', headers: noStore },
      { source: '/admin/:path*', headers: noStore },
      { source: '/api/admin/:path*', headers: noStore },
    ];
  },

  // The webpack() block that used to live here has been removed, which is what
  // lets this project run on Turbopack (the Next 16 default) instead of being
  // pinned to webpack by the --webpack flag in package.json.
  //
  // It did two things:
  //
  // 1. Ran @dhiwise/component-tagger/nextLoader over every .jsx/.tsx file.
  //    That is a scaffolding tool's loader, injecting attributes for its own
  //    visual editor; nothing in src/ reads them. It was a per-file transform
  //    on every compile, paying for a feature the project does not use. The
  //    package is still installed, so restoring this is a paste-back if the
  //    Dhiwise editor is ever wanted again.
  // 2. Set watchOptions.ignored from WATCH_IGNORED_PATHS in dev. Turbopack
  //    does its own watching and does not read this; if a directory needs
  //    excluding, do it through Turbopack's own config rather than reinstating
  //    a webpack block, which would force the whole project back off Turbopack.
};
export default nextConfig;
