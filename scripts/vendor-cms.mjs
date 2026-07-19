// Copies the Sveltia CMS bundle out of node_modules into public/admin/ so it is
// served from our own origin (script-src 'self') instead of a CDN. Runs as the
// npm `prebuild` step, so both local `npm run build` and Cloudflare's build pick
// it up. The version is pinned by @sveltia/cms in package.json devDependencies;
// bump it there to update the CMS. The copied file is gitignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// The package only exports its module entry (dist/sveltia-cms.mjs); the classic
// <script> build sits next to it in the same dist/ folder.
const src = join(dirname(require.resolve("@sveltia/cms")), "sveltia-cms.js");
const destDir = "public/admin";
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "sveltia-cms.js"));
console.log("[vendor-cms] copied sveltia-cms.js -> public/admin/");
