// Locale registry. Framework-free (like everything in lib/), imported by the
// layout, the header and every page's getStaticPaths.
//
// Serbian, Croatian and Bosnian are close enough to share ONE translation
// (`bcs`, Latin script), but each gets its own locale code, URL prefix and
// language name so no community is folded into another's label. They can
// diverge later by giving one of them its own dictionary.
//
// `complete: false` means the translation is still in progress: the pages are
// generated (so they can be reviewed at their real URLs) but are marked
// noindex, kept out of the sitemap and hreflang, and hidden from the language
// selector. Flip to true only when that locale's copy is actually finished.
//
// `dateLocale` is the BCP 47 tag used to format event dates (see
// formatEventDate). It is deliberately separate from `htmlLang`: plain "en"
// formats American-style ("May 13, 2026"), and this is a Swiss club, so English
// pages ask for en-GB ("13 May 2026") and German for de-CH.

export const defaultLocale = "en";

export const locales = [
  { code: "en", dict: "en", label: "English", htmlLang: "en", dateLocale: "en-GB", ogLocale: "en_GB", complete: true },
  { code: "de", dict: "de", label: "Deutsch", htmlLang: "de", dateLocale: "de-CH", ogLocale: "de_CH", complete: true },
  // bs/hr/sr started as raw DeepL output. The board reviews them continuously
  // rather than in one pass, and decided to publish now and correct in place —
  // an imperfect page in someone's own language beats no page at all. The known
  // damage is fixed (HSG had been placed in Edinburgh and New York, the board
  // inbox called a "forum", "Meet & Greet" rendered as "I meet and I greet"),
  // and Serbian is now consistently Latin, matching its sr-Latn tag.
  { code: "bs", dict: "bcs", label: "Bosanski", htmlLang: "bs", dateLocale: "bs-Latn-BA", ogLocale: "bs_BA", complete: true },
  { code: "hr", dict: "bcs", label: "Hrvatski", htmlLang: "hr", dateLocale: "hr-HR", ogLocale: "hr_HR", complete: true },
  { code: "sr", dict: "sr", label: "Srpski", htmlLang: "sr-Latn", dateLocale: "sr-Latn-RS", ogLocale: "sr_RS", complete: true },
];

export const localeCodes = locales.map((l) => l.code);

export function getLocale(code) {
  return locales.find((l) => l.code === (code || defaultLocale)) ?? locales[0];
}

/** Locales whose copy is finished — the ones users are offered and crawlers see. */
export function publishedLocales() {
  return locales.filter((l) => l.complete);
}

/**
 * Every locale as getStaticPaths params. The default locale uses `undefined`
 * so the rest parameter matches zero segments and English stays at /events
 * rather than /en/events.
 */
export function localePaths() {
  return locales.map((l) => ({
    params: { locale: l.code === defaultLocale ? undefined : l.code },
  }));
}

/**
 * "/events" + "de" -> "/de/events";  "/" + "de" -> "/de";  English unchanged.
 * `code` is undefined on default-locale pages (the rest parameter matched zero
 * segments), so treat a missing code as the default rather than building a
 * literal "/undefined/..." prefix.
 */
export function localizePath(path, code) {
  const locale = code || defaultLocale;
  const clean = path === "/" ? "" : path;
  return locale === defaultLocale ? clean || "/" : `/${locale}${clean}`;
}
