/**
 * Generates the YUnited Instagram event-calendar background templates.
 *
 * These are BACKGROUNDS ONLY — no text, no placeholders. Every colour, the
 * kilim motif strip and the diamond geometry are lifted verbatim from the
 * live site (src/styles/global.css, public/assets/motif.svg,
 * src/components/HeroOrnament.astro) so a post sits next to the website
 * without a seam.
 *
 *   node brand/instagram/generate.mjs   # writes the .svg files
 *   node brand/instagram/rasterise.mjs  # writes the .png files (needs Chromium)
 *
 * Where ornament may and may not go is the whole design problem here, and it
 * is decided by the text: the header band, every list row and the footer band
 * are text zones and stay FLAT, so a headline never lands on a diamond. The
 * ornament lives only where text cannot: the boundary between the band and
 * the list, the top of the footer, the footer's outer margins, and — at an
 * opacity low enough to read as paper texture rather than as an object — the
 * top-right of the header band, behind the year.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));

/* ---------- Tokens — copied from :root in src/styles/global.css ---------- */
const RED = "#b3202c";
const RED_DARK = "#8f1a23";
const AZURE = "#1d4e9e";
const GOLD = "#e9b44c";
const PAPER = "#f4ecdd";

/* A diamond is a square on its point. Every diamond on the site is
   equilateral — the motif tile and all four hero-ornament diamonds — so one
   helper draws the lot. */
const diamond = (cx, cy, r) =>
  `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;

/* ---------- The kilim motif strip ----------
   public/assets/motif.svg is a 56x14 tile: red 12px diamond, gold 8px, azure
   12px, gold 8px. The site repeats it at 64px across a 1180px page — roughly
   eighteen tiles. At poster scale that many reads as a dotted line, so the
   tile is enlarged to give nine: the same motif, fewer and bigger, which is
   the "less than the website" the brief asks for. The tile width divides the
   canvas exactly, so the diamonds land in register at both edges the way
   --motif-travel guarantees they do on the site. */
function motifStrip(width, centerY, tileW) {
  const s = tileW / 56;
  const tiles = Math.round(width / tileW);
  const parts = [];
  for (let i = 0; i < tiles; i++) {
    const x = i * tileW;
    parts.push(
      `<path d="${diamond(x + 7 * s, centerY, 6 * s)}" fill="${RED}"/>`,
      `<path d="${diamond(x + 21 * s, centerY, 4 * s)}" fill="${GOLD}"/>`,
      `<path d="${diamond(x + 35 * s, centerY, 6 * s)}" fill="${AZURE}"/>`,
      `<path d="${diamond(x + 49 * s, centerY, 4 * s)}" fill="${GOLD}"/>`,
    );
  }
  return `  <g>\n    ${parts.join("\n    ")}\n  </g>`;
}

/* ---------- One template ---------- */
function template({
  width,
  height,
  bandH,
  footerH,
  margin,
  rowsTop,
  rowsBottom,
  rows,
  tileW,
  watermark,
  footerContentY,
}) {
  const stripY = bandH + 30;
  const gutterR = width - margin;
  const footerY = height - footerH;
  /* Where the footer's own marks sit. Normally the middle of the band — but a
     story's band runs to the bottom of a 1920px canvas, and Instagram covers
     roughly the last 250px of that with its reply bar, so the story pushes its
     footer content up into the safe area and lets the band bleed on behind. */
  const footerMid = footerContentY ?? footerY + footerH / 2;

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  out.push(`  <title>YUnited event calendar — background template</title>`);
  out.push(
    `  <clipPath id="band"><rect width="${width}" height="${bandH}"/></clipPath>`,
  );

  /* Paper ground. */
  out.push(`  <rect width="${width}" height="${height}" fill="${PAPER}"/>`);

  /* Header band. Flat, because the headline goes here. The only thing on it
     is the watermark below, clipped to the band so nothing leaks onto the
     paper — the first version leaked and drew gold lines across the list. */
  out.push(`  <rect width="${width}" height="${bandH}" fill="${RED_DARK}"/>`);

  /* Watermark: the hero ornament's nested diamond (.ornament-outline, a gold
     stroke around empty space), enlarged and dropped to an opacity where it
     reads as texture in the paper rather than as an object competing with the
     year that sits over it.

     It fits ENTIRELY inside the band, and that is the whole trick. Bleeding a
     diamond off an edge is the obvious way to get a big graphic into a small
     band, but a diamond cut in half is a chevron: cropped at the side it
     points left or right, cropped at the top it points down. Two attempts at
     this drew arrows across the header before the shape was sized to fit. */
  const [wx, wy, wr] = watermark;
  out.push(`  <g clip-path="url(#band)">`);
  wr.forEach((r, i) => {
    const opacity = [0.16, 0.1][i] ?? 0.08;
    out.push(
      `    <path d="${diamond(wx, wy, r)}" fill="none" stroke="${GOLD}" stroke-width="3" opacity="${opacity}"/>`,
    );
  });
  out.push(`  </g>`);

  /* The motif strip closes the band. Full bleed, against the margin-width
     hairlines below it — two different scales, so the strip reads as the
     poster's edge and the hairlines as the list's own ruling. */
  out.push(motifStrip(width, stripY, tileW));

  /* Row separators. The only marks inside the list, which otherwise stays
     plain paper: this is the half of the reference layout that is all text. */
  if (rows > 1) {
    const step = (rowsBottom - rowsTop) / rows;
    for (let i = 1; i < rows; i++) {
      const y = +(rowsTop + step * i).toFixed(1);
      out.push(
        `  <rect x="${margin}" y="${y}" width="${gutterR - margin}" height="2" fill="${RED}" opacity="0.32"/>`,
      );
    }
  }

  /* Footer band, opened by the gold hairline the home page uses in place of a
     motif divider under the hero (.home-hero + .motif-divider in global.css). */
  out.push(
    `  <rect y="${footerY}" width="${width}" height="${footerH}" fill="${RED_DARK}"/>`,
  );
  out.push(
    `  <rect y="${footerY}" width="${width}" height="3" fill="${GOLD}" opacity="0.55"/>`,
  );

  /* Bookend diamonds, outboard of the margin so centred footer text clears
     them with the full gutter to spare. */
  const bigR = 14;
  const smallR = 8;
  for (const [bx, sx] of [
    [margin - 16, margin + 22],
    [width - margin + 16, width - margin - 22],
  ]) {
    out.push(`  <path d="${diamond(bx, footerMid, bigR)}" fill="${GOLD}" opacity="0.9"/>`);
    out.push(`  <path d="${diamond(sx, footerMid, smallR)}" fill="${PAPER}" opacity="0.85"/>`);
  }

  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

/* ---------- The four sizes ----------
   rowsTop/rowsBottom bound the list block; the separators divide exactly that
   span, so every row is the same height and the first and last get the same
   breathing room as the ones between them. */
const base4x5 = {
  width: 1080,
  height: 1350,
  bandH: 336,
  footerH: 140,
  margin: 80,
  rowsTop: 412,
  rowsBottom: 1166,
  tileW: 120,
  watermark: [944, 166, [130, 72]],
};

export const variants = [
  ["yunited-event-calendar-1080x1350-5rows.svg", { ...base4x5, rows: 5 }],
  ["yunited-event-calendar-1080x1350-6rows.svg", { ...base4x5, rows: 6 }],
  ["yunited-event-calendar-1080x1350-plain.svg", { ...base4x5, rows: 1 }],
  [
    "yunited-event-calendar-1080x1920-story.svg",
    {
      width: 1080,
      height: 1920,
      bandH: 560,
      footerH: 360,
      footerContentY: 1642,
      margin: 80,
      rowsTop: 646,
      rowsBottom: 1508,
      rows: 6,
      tileW: 120,
      watermark: [940, 268, [150, 84]],
    },
  ],
];

for (const [name, cfg] of variants) {
  writeFileSync(join(OUT, name), template(cfg));
  console.log("wrote", name);
}
