// Maps a content-JSON image path (e.g. "images/events/26_27/x.webp") to the
// imported image asset, so Astro's <Image> can optimize it at build time.
// Images live under src/images/ (not public/) precisely so they go through
// the build's sharp pipeline instead of being served untouched.
const modules = import.meta.glob("/src/images/**/*.{webp,jpg,jpeg,png,avif}", {
  eager: true,
});

export function resolveImage(jsonPath) {
  if (!jsonPath) return undefined;
  const key = "/src/" + jsonPath.replace(/^\/+/, "");
  const mod = modules[key];
  if (!mod) {
    // Fail the build loudly on a typo'd path rather than shipping a broken
    // image — the same guarantee the old string paths never gave us.
    throw new Error(
      `Image not found for "${jsonPath}" — expected a file at src/${jsonPath}`
    );
  }
  return mod.default;
}
