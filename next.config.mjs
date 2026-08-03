import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',
  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },
  async redirects() {
    return [];
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
