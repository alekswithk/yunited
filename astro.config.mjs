import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { defaultLocale, locales } from './src/i18n/config.js';

// URL prefixes of locales whose translation is still in progress. Their pages
// are generated (reviewable at real URLs) but marked noindex, so they must stay
// out of the sitemap too — listing a noindex page contradicts itself.
const draftPrefixes = locales
  .filter((l) => !l.complete && l.code !== defaultLocale)
  .map((l) => `/${l.code}`);

function isIndexable(page) {
  const { pathname } = new URL(page);
  if (pathname.endsWith('/404')) return false;
  return !draftPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Phase 1 migration: same static site, but pages are assembled from one
// shared layout and event/member content is rendered to HTML at build time
// (no client-side fetching), so crawlers and link previews see real content.
export default defineConfig({
  site: 'https://yunited.ch',
  trailingSlash: 'never',
  // Generate the sitemap from the actual routes at build time, so it can never
  // drift from the pages that exist (the old public/sitemap.xml was hand-kept).
  integrations: [sitemap({ filter: isIndexable })],
  build: {
    // Emit /about.html etc. so Cloudflare serves it at /about — keeps the
    // existing extensionless canonicals correct with no redirect map.
    format: 'file',
    // Never inline <style> into the page: keeps the CSP free of
    // style-src 'unsafe-inline' for the stylesheet.
    inlineStylesheets: 'never',
  },
});
