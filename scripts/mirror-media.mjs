// Mirrors src/images/** to public/images/** so /admin can show them.
//
// WHY THIS IS NEEDED. Source images deliberately live under src/, not public/,
// so Astro's sharp pipeline processes them — every image a page renders is
// resized, converted and emitted as a hashed file under /_astro/ (see the image
// note in CLAUDE.md). Nothing serves the originals, and that is normally the
// point.
//
// But the admin panel at /admin has to SHOW the board which photo an entry
// currently uses, and all it has is the path stored in the content JSON. It
// renders that as an <img src>, in a browser, from the live site — it cannot
// read a file out of the repo. With the originals unserved, /images/events/…
// returned 404 and every event and member thumbnail rendered broken. (The same
// was true of Sveltia before it, for the same reason.)
//
// So the originals are published too, at the exact path the content JSON already
// uses. An entry stores "images/events/26_27/x.webp" (relative to src/), so
// mirroring src/images -> /images makes that string resolve as a URL verbatim.
// That equivalence is the whole trick, and it is why this mirrors the tree as-is
// rather than flattening it.
//
// The cost is ~3.5 MB of originals in the deploy that **no page ever links to** —
// pages reference the optimized /_astro/ copies — so no visitor downloads them.
// Only the CMS does. They are marked noindex in public/_headers so the duplicates
// stay out of search results.
//
// Written into public/ (copied verbatim into dist/ by Astro) rather than dist/
// directly, so `npm run dev` serves them too. The copy is gitignored —
// generated, never committed; src/images is the source of truth.
import { cpSync, existsSync, rmSync } from "node:fs";

const SRC = "src/images";
const DEST = "public/images";

if (!existsSync(SRC)) {
  console.log("[mirror-media] no src/images — nothing to mirror");
  process.exit(0);
}

// Remove first so a photo deleted from src/ does not linger in the deploy and
// keep showing up in /admin.
rmSync(DEST, { recursive: true, force: true });

cpSync(SRC, DEST, {
  recursive: true,
  // .gitkeep files exist to keep empty dirs in git; they have no business being
  // served.
  filter: (path) => !path.endsWith(".gitkeep"),
});

console.log(`[mirror-media] mirrored ${SRC} -> ${DEST}/ (for CMS previews)`);
