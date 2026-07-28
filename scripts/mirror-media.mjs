// Mirrors src/images/** to public/images/** so the CMS can preview them.
//
// WHY THIS IS NEEDED. Source images deliberately live under src/, not public/,
// so Astro's sharp pipeline processes them — every image a page renders is
// resized, converted and emitted as a hashed file under /_astro/ (see the image
// note in CLAUDE.md). Nothing serves the originals, and that is normally the
// point.
//
// But Sveltia previews an image by fetching its PUBLIC URL. Its own config
// schema says so: public_folder is "relative to the project's public URL". With
// the originals unserved, /images/events/… returned 404 and every event and
// member thumbnail in the admin panel rendered as a broken image. There is no
// option to make it read the file out of the repo instead — its media model
// assumes the media folder is on the site.
//
// So the originals are published too, at the exact path the content JSON already
// uses. An entry stores "images/events/26_27/x.webp" (relative to src/), so
// mirroring src/images -> /images makes that string resolve as a URL verbatim,
// whether Sveltia resolves it against the site root or builds it from
// public_folder. That equivalence is the whole trick, and it is why this mirrors
// the tree as-is rather than flattening it.
//
// The cost is ~3.5 MB of originals in the deploy that **no page ever links to** —
// pages reference the optimized /_astro/ copies — so no visitor downloads them.
// Only the CMS does. They are marked noindex in public/_headers so the duplicates
// stay out of search results.
//
// Written into public/ (copied verbatim into dist/ by Astro) rather than dist/
// directly, so `npm run dev` serves them too. The copy is gitignored, exactly
// like the vendored CMS bundle next to it — generated, never committed.
import { cpSync, existsSync, rmSync } from "node:fs";

const SRC = "src/images";
const DEST = "public/images";

if (!existsSync(SRC)) {
  console.log("[mirror-media] no src/images — nothing to mirror");
  process.exit(0);
}

// Remove first so a photo deleted from src/ does not linger in the deploy and
// keep showing up in the CMS asset browser.
rmSync(DEST, { recursive: true, force: true });

cpSync(SRC, DEST, {
  recursive: true,
  // .gitkeep files exist to keep empty dirs in git; they have no business being
  // served.
  filter: (path) => !path.endsWith(".gitkeep"),
});

console.log(`[mirror-media] mirrored ${SRC} -> ${DEST}/ (for CMS previews)`);
