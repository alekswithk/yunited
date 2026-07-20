// Maps a content-JSON image path (e.g. "images/events/26_27/x.webp") to the
// imported image asset, so Astro's <Image> can optimize it at build time —
// resized, converted to WebP, 1×/2× srcset, hashed under /_astro/. Images live
// under src/images/ (not public/) precisely so they go through the sharp
// pipeline instead of being served untouched.
//
// The CMS lets the board upload photos straight from a phone or download, so
// the loader is deliberately forgiving about the file extension: every raster
// format sharp can decode, in either case (so IMG_1234.PNG works as well as
// x.png). The brace list covers lower- and upper-case; the lookup is also
// lowercased so a path whose case drifts from the file still resolves. HEIC is
// the one exception — see resolveImage.
const modules = import.meta.glob(
  "/src/images/**/*.{webp,WEBP,jpg,JPG,jpeg,JPEG,jfif,JFIF,png,PNG,avif,AVIF,gif,GIF,tif,TIF,tiff,TIFF,bmp,BMP}",
  { eager: true }
);

// Case-insensitive lookup keyed by the lowercased project path.
const byKey = new Map(
  Object.entries(modules).map(([path, mod]) => [path.toLowerCase(), mod])
);

export function resolveImage(jsonPath) {
  if (!jsonPath) return undefined;
  const key = ("/src/" + jsonPath.replace(/^\/+/, "")).toLowerCase();
  const mod = byKey.get(key);
  if (!mod) {
    // HEIC/HEIF is what iPhones shoot by default, but the build's sharp can't
    // decode its HEVC data. Give the board a clear, actionable message instead
    // of a cryptic sharp crash or a bare "not found".
    if (/\.(heic|heif)$/i.test(jsonPath)) {
      throw new Error(
        `"${jsonPath}" is a HEIC/HEIF photo, which the build can't convert. ` +
          `Please upload it as JPG or PNG instead — on iPhone, either set ` +
          `Settings → Camera → Formats → "Most Compatible", or share/export the ` +
          `photo, which saves it as JPEG.`
      );
    }
    // Any other miss is a typo'd path: fail the build loudly rather than ship a
    // broken image — the guarantee the old string paths never gave us.
    throw new Error(
      `Image not found for "${jsonPath}" — expected a file at src/${jsonPath}`
    );
  }
  return mod.default;
}
