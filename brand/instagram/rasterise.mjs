/**
 * Rasterises the .svg templates in this folder to .png at their exact pixel
 * size, which is the form Instagram and Canva actually want.
 *
 *   node brand/instagram/rasterise.mjs
 *
 * It drives a headless Chromium, so it needs one on the machine. Set
 * CHROMIUM_BIN, or let it try the usual names. Use the pure headless shell if
 * you have it: full Chromium reserves room for browser UI inside --window-size
 * and hands back a screenshot with a blank band along the bottom.
 *
 * Nothing in the templates is text, so there is no font to embed and the PNG
 * is byte-identical wherever it is run.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  process.env.CHROMIUM_BIN,
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "chromium",
  "chromium-browser",
  "google-chrome",
].filter(Boolean);

const bin = CANDIDATES.find((c) => {
  try {
    execFileSync("sh", ["-c", `command -v ${JSON.stringify(c)} || test -x ${JSON.stringify(c)}`]);
    return true;
  } catch {
    return false;
  }
});

if (!bin) {
  console.error("No Chromium found. Set CHROMIUM_BIN to a headless Chrome binary.");
  process.exit(1);
}

for (const svg of readdirSync(OUT).filter((f) => f.endsWith(".svg"))) {
  const src = join(OUT, svg);
  const head = execFileSync("head", ["-c", "400", src]).toString();
  const width = head.match(/width="(\d+)"/)[1];
  const height = head.match(/height="(\d+)"/)[1];
  const png = join(OUT, svg.replace(/\.svg$/, ".png"));

  /* A wrapper page rather than the SVG directly: Chromium fits a standalone
     SVG document to the window, which silently rescales it. An <img> at an
     explicit width/height on a zero-margin page does not. */
  const wrapper = join(OUT, "_rasterise.html");
  writeFileSync(
    wrapper,
    `<style>html,body{margin:0;padding:0;background:#fff}img{display:block}</style>` +
      `<img src="${svg}" width="${width}" height="${height}">`,
  );

  execFileSync(bin, [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    `--screenshot=${png}`,
    `file://${wrapper}`,
  ], { stdio: "ignore" });

  unlinkSync(wrapper);
  if (!existsSync(png)) throw new Error(`failed to write ${png}`);
  console.log(`wrote ${svg.replace(/\.svg$/, ".png")} (${width}x${height})`);
}
