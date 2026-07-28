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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// The CMS font origin, which is Sveltia's to change and not ours.
//
// Sveltia loads its Material Symbols icon font as .woff2 from a CDN. If the
// /admin font-src does not allow that origin, the font is blocked, the icon
// ligatures never resolve, and the whole toolbar renders as literal words —
// "cloud_upload", "delete", "save". The board sees a broken editor; the build,
// the type-check and every other assertion here stay perfectly green.
//
// This already happened twice. #16 allowed Google Fonts. Then @sveltia/cms 0.174
// moved the fonts to Fontsource on cdn.jsdelivr.net and the icons broke again —
// a *dependency bump*, with no change to any file we wrote, silently invalidated
// a hand-maintained line in public/_headers.
//
// So rather than pinning a URL that is not ours, read the font URLs out of the
// vendored bundle and require the policy to cover them. When Sveltia moves hosts
// again this fails loudly at build time, naming the origin to add.
function checkCmsFontOrigins() {
  const bundle = new URL("../public/admin/sveltia-cms.js", import.meta.url).pathname;
  const headers = new URL("../public/_headers", import.meta.url).pathname;

  let js;
  try {
    js = readFileSync(bundle, "utf8");
  } catch {
    // Vendored by the `prebuild` step and gitignored, so it is legitimately
    // absent if someone runs this script without building first.
    console.warn("⚠  public/admin/sveltia-cms.js not vendored — skipping the CMS font check.");
    console.warn("   Run `npm run vendor:cms` (or a full `npm run build`) to include it.");
    return 0;
  }

  const fontUrls = [...js.matchAll(/https:\/\/[^"'`)\s]+\.(?:woff2?|ttf|otf)/g)].map((m) => m[0]);
  const origins = [...new Set(fontUrls.map((u) => new URL(u).origin))];
  if (origins.length === 0) return 0; // self-hosted or inlined: nothing to allow

  // The /admin policy is the last Content-Security-Policy line in the file; the
  // global one for /* comes first and is dropped for this path by "!".
  const policies = readFileSync(headers, "utf8").match(/^\s*Content-Security-Policy:.*$/gm) ?? [];
  const adminPolicy = policies.at(-1) ?? "";
  const fontSrc = adminPolicy.match(/font-src([^;]*)/)?.[1] ?? "";

  const missing = origins.filter((origin) => !fontSrc.includes(origin));
  if (missing.length === 0) return 0;

  console.error("✗ public/_headers — the /admin font-src does not allow the CMS icon font");
  for (const origin of missing) console.error(`    missing: ${origin}`);
  console.error(`    font-src is currently:${fontSrc}`);
  console.error(
    "    Sveltia moved its font host. Add the origin above to font-src in the\n" +
      "    /admin/* block and remove any origin no longer listed here. Left as is,\n" +
      "    the CMS toolbar renders as raw text like \"cloud_upload\".",
  );
  return missing.length;
}

// ---------------------------------------------------------------------------
// Every content image must also be reachable at its own path.
//
// Pages render the optimized /_astro/ copies, so the build and every page render
// perfectly whether or not the originals are served. But Sveltia previews an
// image by fetching its PUBLIC URL — the literal string in the content JSON —
// and if that 404s the admin panel shows broken thumbnails while everything else
// stays green. That is what happened here.
//
// scripts/mirror-media.mjs publishes src/images -> /images to make those strings
// resolve. Drop the mirror step from `prebuild` and nothing fails; the board just
// silently loses their previews again. So assert it.
function checkMediaMirror() {
  const contentDirs = ["content/events", "content/members", "content/partners"];
  const missing = [];

  for (const dir of contentDirs) {
    const full = new URL(`../${dir}`, import.meta.url).pathname;
    let files;
    try {
      files = readdirSync(full).filter((f) => f.endsWith(".json"));
    } catch {
      continue; // a collection that does not exist yet
    }

    for (const file of files) {
      const entry = JSON.parse(readFileSync(join(full, file), "utf8"));
      // `image` on an event, `photo` on a member, `logo` on a partner.
      for (const value of [entry.image, entry.photo, entry.logo]) {
        if (typeof value !== "string" || value === "") continue;
        const urlPath = "/" + value.replace(/^\/+/, "");
        if (!existsSync(join(DIST, urlPath))) {
          missing.push(`${dir}/${file} → ${urlPath}`);
        }
      }
    }
  }

  if (missing.length === 0) return 0;

  console.error("✗ dist/ — content images are not served at the path the CMS asks for");
  for (const m of missing.slice(0, 5)) console.error(`    ${m}`);
  if (missing.length > 5) console.error(`    …and ${missing.length - 5} more`);
  console.error(
    "    Pages are fine (they use the optimized /_astro/ copies), but the CMS\n" +
      "    previews these by public URL, so the admin panel will show broken\n" +
      "    thumbnails. Check that `prebuild` still runs scripts/mirror-media.mjs.",
  );
  return missing.length;
}

failures += checkCmsFontOrigins();
failures += checkMediaMirror();

if (failures > 0) {
  console.error(
    `\n${failures} violation(s). See the comments in scripts/check-dist.mjs.\n` +
      "Everything asserted here is invisible to `astro build` and `astro check`:\n" +
      "it breaks the live site only under the CSP, or breaks only the CMS.",
  );
  process.exit(1);
}

console.log("✓ dist/ — CSP-clean, on-brand, CMS font origin allowed, media previewable");
