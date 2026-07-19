import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Phase 1 migration: same static site, but pages are assembled from one
// shared layout and event/member content is rendered to HTML at build time
// (no client-side fetching), so crawlers and link previews see real content.
export default defineConfig({
  site: 'https://yunited.ch',
  trailingSlash: 'never',
  // Generate the sitemap from the actual routes at build time, so it can never
  // drift from the pages that exist (the old public/sitemap.xml was hand-kept).
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404') })],
  build: {
    // Emit /about.html etc. so Cloudflare serves it at /about — keeps the
    // existing extensionless canonicals correct with no redirect map.
    format: 'file',
    // Never inline <style> into the page: keeps the CSP free of
    // style-src 'unsafe-inline' for the stylesheet.
    inlineStylesheets: 'never',
  },
});
