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

// HTML comments are not markup and cannot execute, so they are removed before
// any of the checks below run. This is not a convenience: public/admin/index.html
// documents the no-inline-script rule *in a comment*, which means it contains
// the literal text "<script>" — and matching that produced a build failure over
// a sentence explaining why build failures happen. A comment that talks about
// markup is normal in this repo; treating it as markup is the bug.
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

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
  // /admin used to be exempt here: it was a third-party single-page app under
  // its own looser CSP, and Sveltia's markup was not ours to police. It is now
  // our own hand-written page under a policy at least as strict as the public
  // site's, so it gets checked like everything else.
  const rel = relative(DIST, file);
  const html = readFileSync(file, "utf8").replace(HTML_COMMENT, "");
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
// The admin panel must stay entirely first-party.
//
// HISTORY, because it is the reason this check exists at all. The old Sveltia
// admin app pulled its icon font from a CDN, and *which* CDN was Sveltia's
// choice, not ours — it moved from Google Fonts to jsDelivr in a patch release
// and the /admin toolbar silently rendered as the literal words "cloud_upload",
// "delete", "save". A dependency bump, with no change to any file in this repo,
// invalidated a hand-maintained line in public/_headers.
//
// The replacement panel is our own HTML/CSS/JS with no third-party anything, so
// that whole class of breakage is gone — as long as it STAYS that way. Adding a
// CDN font, an icon set or an analytics snippet to public/admin/ would be
// blocked by the /admin CSP (default-src 'self') with no build failure and no
// visible error outside the browser console. So: assert that nothing under
// /admin references an off-site origin.
function checkAdminIsFirstParty() {
  const adminDir = join(DIST, "admin");
  if (!existsSync(adminDir)) {
    console.error("✗ dist/admin — the admin panel was not built");
    console.error("    public/admin/ is copied verbatim into dist/. Is it still there?");
    return 1;
  }

  const offSite = [];
  for (const file of readdirSync(adminDir)) {
    if (!/\.(html|css|js)$/.test(file)) continue;
    const text = readFileSync(join(adminDir, file), "utf8");
    // Bare scheme-relative and absolute URLs alike. Anything pointing at a host
    // is off-site by definition; same-origin references are all root-relative.
    for (const [url] of text.matchAll(/\bhttps?:\/\/[^\s"'`)<]+/g)) {
      // Links the board is meant to click are fine — they navigate away rather
      // than pulling a subresource, and form-action/navigation is not what
      // default-src governs. Only yunited.ch and github.com appear, both as
      // plain <a href>.
      if (/^https:\/\/(yunited\.ch|github\.com)\b/.test(url)) continue;
      offSite.push(`admin/${file} → ${url}`);
    }
  }

  if (offSite.length === 0) return 0;

  console.error("✗ dist/admin — the panel references an off-site origin");
  for (const hit of offSite.slice(0, 5)) console.error(`    ${hit}`);
  console.error(
    "    The /admin CSP is default-src 'self' (see public/_headers), so this is\n" +
      "    blocked at runtime with no build failure — the board just gets a panel\n" +
      "    missing a font or a script. Either vendor the asset into public/admin/\n" +
      "    or, if it genuinely must be remote, allow the origin in the /admin/*\n" +
      "    policy deliberately.",
  );
  return offSite.length;
}

// ---------------------------------------------------------------------------
// The admin panel's script must be able to find the elements it wires up.
//
// admin.js reaches for its elements once, by id, at load. Rename or drop an id
// in index.html and the lookup returns null — then the first `el.something.
// addEventListener` throws, the module dies before it renders anything, and the
// board gets a page with a header, an empty list and no working buttons. There
// is no build error and no server error; the whole failure lives in a console
// nobody has open.
//
// The two files are hand-written and hand-matched, which is exactly the kind of
// pairing that drifts. So check it, on the built output, the way the browser
// will resolve it.
function checkAdminWiring() {
  const dir = join(DIST, "admin");
  if (!existsSync(dir)) return 0; // already reported by checkAdminIsFirstParty

  const js = readFileSync(join(dir, "admin.js"), "utf8");
  const html = readFileSync(join(dir, "index.html"), "utf8");

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  // admin.js looks everything up through its `$` helper: $("banner").
  const wanted = [...js.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  const missing = [...new Set(wanted.filter((id) => !ids.has(id)))];

  if (missing.length === 0) return 0;

  console.error("✗ dist/admin — admin.js looks up ids that index.html does not have");
  for (const id of missing) console.error(`    #${id}`);
  console.error(
    "    The script throws on the first missing element and stops, leaving the\n" +
      "    board a page whose buttons do nothing. Add the element, or update the\n" +
      "    lookup in public/admin/admin.js.",
  );
  return missing.length;
}

// ---------------------------------------------------------------------------
// Every content image must also be reachable at its own path.
//
// Pages render the optimized /_astro/ copies, so the build and every page render
// perfectly whether or not the originals are served. But /admin shows each
// entry's current photo by fetching its PUBLIC URL — the literal string in the
// content JSON — and if that 404s the admin panel shows broken thumbnails while
// everything else stays green. That is what happened here.
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

  console.error("✗ dist/ — content images are not served at the path /admin asks for");
  for (const m of missing.slice(0, 5)) console.error(`    ${m}`);
  if (missing.length > 5) console.error(`    …and ${missing.length - 5} more`);
  console.error(
    "    Pages are fine (they use the optimized /_astro/ copies), but /admin\n" +
      "    shows these by public URL, so the admin panel will render broken\n" +
      "    thumbnails. Check that `prebuild` still runs scripts/mirror-media.mjs.",
  );
  return missing.length;
}

// The old "optional CMS fields that are secretly mandatory" check lived here.
// It tested every `required: false` field in Sveltia's config.yml against the
// empty string, because Sveltia evaluated `required` and `pattern`
// independently and so made optional fields impossible to leave blank. Both the
// config and the trap are gone: /admin now validates with the very same Zod
// schemas the build uses (src/lib/schema.js), so "what the editor accepts" and
// "what the build accepts" are one rule rather than two that can drift.
// worker/collections.test.js asserts the form and the schema still agree.

// ---------------------------------------------------------------------------
// No word run into the link that follows it.
//
// Sentences containing a link are assembled from three dictionary keys —
// `…Pre`, `…Link`, `…Post` — so the href can stay locale-aware. That means the
// space before the link lives at the end of the Pre string, or in the template
// between the two, and BOTH are easy to lose:
//
//   * in the template, writing the anchor on the next line looks like
//     whitespace but collapses to nothing. The footer rendered "Membership is
//     managed onuniclubs.ch" in all five locales this way.
//   * in a dictionary, a trailing space is invisible in review, and a
//     translation that restructures the sentence drops it. DeepL turned the
//     German exchange line into a complete sentence ending in a full stop,
//     leaving "den Kontakt her.Kontakt aufnehmen."
//
// Nothing catches either one: the build succeeds, the type-check is clean, the
// text is all present. It is only wrong to a reader, in one language, on one
// page. So check the rendered output for a link glued to the character before
// it.
function checkLinkSpacing() {
  const glued = [];

  for (const file of htmlFiles(DIST)) {
    const rel = relative(DIST, file);
    if (rel.startsWith("admin/")) continue; // no composed sentences there

    const html = readFileSync(file, "utf8").replace(HTML_COMMENT, "");

    // A word character or sentence punctuation immediately before an anchor.
    // `>` is excluded because that is a tag boundary, not text, and block-level
    // links legitimately sit flush against the element that opens them.
    for (const match of html.matchAll(/([\p{L}\p{N},.;:!?])<a\s[^>]*>([^<]{1,40})</gu)) {
      glued.push(`${rel}: "…${match[1]}${match[2]}…"`);
    }
  }

  if (glued.length === 0) return 0;

  console.error("✗ dist/ — a link is run into the word before it");
  for (const hit of [...new Set(glued)].slice(0, 6)) console.error(`    ${hit}`);
  console.error(
    "    Add the space where it belongs: at the end of the `…Pre` dictionary\n" +
      "    string, or as an explicit {\" \"} in the template — never as a bare\n" +
      "    newline, which collapses to nothing.",
  );
  return glued.length;
}

failures += checkAdminIsFirstParty();
failures += checkAdminWiring();
failures += checkLinkSpacing();
failures += checkMediaMirror();

if (failures > 0) {
  console.error(
    `\n${failures} violation(s). See the comments in scripts/check-dist.mjs.\n` +
      "Everything asserted here is invisible to `astro build` and `astro check`:\n" +
      "it breaks the live site only under the CSP, or breaks only /admin.",
  );
  process.exit(1);
}

console.log("✓ dist/ — CSP-clean, on-brand, /admin first-party and wired, media previewable");
