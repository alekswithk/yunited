// Post-build assertions on dist/ — the invariants that nothing else can catch.
//
// WHY THIS EXISTS. The site ships a Content-Security-Policy with no
// 'unsafe-inline' in either script-src or style-src (see public/_headers). What
// holds that up is not the policy but two build settings and one authoring
// habit:
//
//   * astro.config.mjs  build.inlineStylesheets: 'never'   -> no <style> in the page
//   * astro.config.mjs  vite.build.assetsInlineLimit: 0    -> no inlined <script>
//   * nobody writes a style="…" attribute in a .astro file
//
// Break any of those and the build still succeeds, `astro check` still passes,
// and the page silently stops working in any browser that enforces the header.
// That is the worst failure shape available: green everywhere, broken in
// production, and invisible until someone loads the site. This script turns it
// into a red build instead.
//
// It runs on the BUILT output rather than the source, so it catches the problem
// however it arrives — a hand-written attribute, a config regression, or an
// Astro upgrade that changes inlining defaults.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;

/** Every .html file under dist/, recursively. */
function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return htmlFiles(full);
    return full.endsWith(".html") ? [full] : [];
  });
}

// A style attribute in tag position. Matching `<tag … style=` rather than a bare
// "style=" keeps prose and JSON-LD values (a description that happens to contain
// the word) from tripping the check.
const STYLE_ATTR = /<[a-zA-Z][^>]*?\sstyle\s*=/g;

// An opening <script> with no src. Astro emits bundled scripts as
// `<script type="module" src="/_astro/….js">`; anything without a src is inline.
const SCRIPT_TAG = /<script\b([^>]*)>/gi;

// …except a script whose type is not a JavaScript MIME type. Such an element is
// a data block: HTML's "prepare the script element" steps return before it ever
// reaches the CSP check, so nothing executes and script-src does not apply. The
// site's JSON-LD relies on exactly this.
const DATA_BLOCK = /type\s*=\s*["'](application\/ld\+json|application\/json)["']/i;

const checks = [
  {
    name: "no style= attributes (style-src has no 'unsafe-inline')",
    find: (html) => [...html.matchAll(STYLE_ATTR)].map((m) => m[0]),
  },
  {
    name: "no inline <script> (script-src has no 'unsafe-inline')",
    find: (html) =>
      [...html.matchAll(SCRIPT_TAG)]
        .filter(([, attrs]) => !/\ssrc\s*=/i.test(attrs) && !DATA_BLOCK.test(attrs))
        .map(([tag]) => tag),
  },
  {
    // The brand is "YUnited" everywhere in copy and metadata. The logo artwork
    // is drawn vector paths that read "Yunited" and deliberately stays that way,
    // but it is an <img>, so its letterforms never reach the HTML. Anything
    // matching here is therefore prose or a label that drifted.
    name: 'brand is spelled "YUnited" in rendered copy',
    find: (html) => (html.match(/\bYunited\b/g) ?? []),
  },
];

let failures = 0;

for (const file of htmlFiles(DIST)) {
  // The CMS is a third-party single-page app under its own, looser CSP (see the
  // /admin block in public/_headers). Its markup is not ours to police.
  const rel = relative(DIST, file);
  if (rel.startsWith("admin/")) continue;

  const html = readFileSync(file, "utf8");
  for (const check of checks) {
    const hits = check.find(html);
    if (hits.length === 0) continue;
    failures += hits.length;
    console.error(`✗ ${rel} — ${check.name}`);
    for (const hit of [...new Set(hits)].slice(0, 3)) {
      console.error(`    ${hit.slice(0, 120)}`);
    }
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} violation(s). See the comment at the top of scripts/check-dist.mjs:\n` +
      "these break the site only in browsers that enforce the CSP, so they cannot\n" +
      "be caught by `astro build` or `astro check`.",
  );
  process.exit(1);
}

console.log("✓ dist/ is CSP-clean and on-brand");
