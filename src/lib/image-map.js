/** Build a case-insensitive image lookup without silently hiding collisions. */
export function caseInsensitiveImageMap(entries) {
  const byKey = new Map();
  const originals = new Map();

  for (const [path, value] of entries) {
    const key = path.toLowerCase();
    const previous = originals.get(key);
    if (previous && previous !== path) {
      throw new Error(
        `Image paths differ only by case: "${previous}" and "${path}". ` +
          "Rename one file so the build has one unambiguous image.",
      );
    }
    originals.set(key, path);
    byKey.set(key, value);
  }

  return byKey;
}
