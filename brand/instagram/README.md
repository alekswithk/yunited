# Instagram event-calendar templates

Background images for the club's event-schedule posts. **They contain no text
and no placeholders** — every word is typed on top, in Canva or anywhere else.

| File | Size | Use |
| --- | --- | --- |
| `yunited-event-calendar-1080x1350-5rows.png` | 1080 × 1350 | feed post, five events |
| `yunited-event-calendar-1080x1350-6rows.png` | 1080 × 1350 | feed post, six events |
| `yunited-event-calendar-1080x1350-plain.png` | 1080 × 1350 | feed post, no ruling — lay the list out freely |
| `yunited-event-calendar-1080x1920-story.png` | 1080 × 1920 | story / reel cover, six events |

The `.svg` beside each `.png` is the same artwork as vector: use it if you need
another size, another row count, or a print-resolution export.

## Why it looks the way it does

Everything is taken from the live site rather than approximated, so a post and
`yunited.ch` read as one thing:

| | |
| --- | --- |
| Bands and rules | `--color-red-dark` `#8f1a23`, `--color-red` `#b3202c` |
| Paper | `--color-paper` `#f4ecdd` |
| Diamond strip | `public/assets/motif.svg` — the kilim tile, red / gold / azure |
| Gold hairline over the footer | the rule the home page puts under its hero |
| Diamond watermark in the header | `.ornament-outline` from `HeroOrnament.astro` |
| Gold / azure | `--color-gold` `#e9b44c`, `--color-azure` `#1d4e9e` |

The site uses the kilim strip between *every* section; a poster gets one, and
the header watermark sits at 16% opacity. That is the "less than the website"
the templates are aiming for — the ornament frames the text instead of sharing
space with it.

**Ornament is only ever in places text does not go**: the boundary between the
header band and the list, the top of the footer, and the footer's outer
margins. The header band, every list row and the centre of the footer are flat
colour, so nothing you type ever lands on a diamond.

## Where the text goes

All coordinates are in pixels from the top-left of the 1080-wide canvas, which
is exactly what Canva's **Position → Advanced** panel uses.

### 1080 × 1350, five rows

```
x margin            80 left, 80 right   (text column 80 → 1000)

Header band         0 → 336             title and year live here
  safe for text     y 70 → 300
  watermark         nested diamond centred (944, 166) — the year can sit
                    straight over it, it is only texture

Motif strip         y 366               do not cover it

List                y 412 → 1166        five rows of 150.8
  row tops          412 · 562.8 · 713.6 · 864.4 · 1015.2
  separators at     562.8 · 713.6 · 864.4 · 1015.2

Footer band         1210 → 1350
  safe for text     x 130 → 950, centred on y 1280
  bookend diamonds  x 64 and 102, x 978 and 1016
```

Column positions that match the reference layout (proved by rendering them):
day number and month at **x 80**, event title and venue at **x 300**, time and
address at **x 700**. Start a row's text ~12px below the row top.

### 1080 × 1350, six rows

Same as above except the list is six rows of 125.7, with separators at
**537.7 · 663.3 · 789 · 914.7 · 1040.3**.

### 1080 × 1350, plain

Same bands, same margins, no separators at all.

### 1080 × 1920, story

```
Header band         0 → 560     safe for text y 260 → 520
Motif strip         y 590
List                y 646 → 1508, six rows of 143.7
  separators at     789.7 · 933.3 · 1077 · 1220.7 · 1364.3
Footer              gold rule at 1560, bookends and text centred on y 1642
```

Instagram covers roughly the top 250px and bottom 250px of a story with its own
UI. The footer content sits at 1642 for that reason and the red band simply
bleeds on behind it — **keep every word between y 250 and y 1670.**

## Type

The site's three faces, in the roles it uses them for:

| Role | Font | Fallbacks if it is missing |
| --- | --- | --- |
| Headline, day number, event title | **Fraunces** (700–800) | Playfair Display, DM Serif Display |
| Venue, address | **Newsreader** | Lora, Source Serif 4 |
| Month, time, the footer URL | **Space Mono** (700), letter-spaced | Courier Prime, Roboto Mono |

All three are Google Fonts. Canva carries most of that library, so search the
font box by name first — whether each one is actually there is not something
this repo can check, which is what the fallback column is for. Sizes that
worked at 1080 × 1350: headline 92px, day number 72px,
event title 44px, venue 31px, time 26px, address 26px, month 21px with 0.12em
letter-spacing, footer 27px with 0.14em.

Text colours: cream `#f4ecdd` and gold `#e9b44c` on the red bands; `#b3202c`
for day numbers, `#8f1a23` for event titles, `#1a1611` for times and
`#6a5f4e` for months and addresses on paper.

## Using it in Canva

Canva has no importable project format, so the template goes in as an image —
which is the point of shipping it as a flat background.

1. **Create a design → Custom size → 1080 × 1350 px** (or 1080 × 1920 for the
   story).
2. **Uploads → Upload files**, pick the `.png`.
3. Drag it onto the page and let it snap to the full canvas.
4. Right-click it → **Lock**. Now it cannot be nudged while you type.
5. Add a text box per line. With a box selected, open **Position → Advanced**
   and type the X and Y from the table above — Canva's numbers are the same
   pixels, so the rows line up exactly instead of by eye.
6. Save it as a **Brand Template** (or just duplicate the design) so next
   semester starts from the finished layout rather than from the background.

The club logo is not baked in, so you can place it wherever a given post wants
it: it is in this repo at `public/assets/yunited-logo.svg`, and Canva accepts
SVG uploads.

## Regenerating

```bash
node brand/instagram/generate.mjs    # artwork → .svg
node brand/instagram/rasterise.mjs   # .svg → .png (needs a headless Chromium)
```

`generate.mjs` holds the sizes, row counts and ornament positions in one config
block at the bottom; add an entry there for a new size. These files are not
part of the website build — nothing under `brand/` is read by Astro, the
Worker, or any of the checks.
