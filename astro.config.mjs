import { defineConfig } from 'astro/config';

// Phase 1 migration: same static site, but pages are assembled from one
// shared layout and event/member content is rendered to HTML at build time
// (no client-side fetching), so crawlers and link previews see real content.
export default defineConfig({
  site: 'https://yunited.ch',
  trailingSlash: 'never',
  build: {
    // Emit /about.html etc. so Cloudflare serves it at /about — keeps the
    // existing extensionless canonicals correct with no redirect map.
    format: 'file',
    // Never inline <style> into the page: keeps the CSP free of
    // style-src 'unsafe-inline' for the stylesheet.
    inlineStylesheets: 'never',
  },
});
