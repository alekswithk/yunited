// Locale registry. Framework-free (like everything in lib/), imported by the
// layout, the header and every page's getStaticPaths.
//
// Bosnian, Croatian and Serbian each have their OWN dictionary. They used to
// share one (`bcs`) on the theory that the differences were small enough not to
// matter, and each locale kept its own code and URL prefix so no community was
// folded into another's label — but the shared file itself was not neutral. It
// was overwhelmingly Croatian (sustav, sveučilište, inozemstvo, svibnja) with
// stray Bosnian forms mixed in: the same university appeared as "Sveučilištu u
// St. Gallenu" three times and "Univerzitetu St. Gallen" three times in one
// file. So a Bosnian reader was served inconsistent Croatian, and the label was
// the only thing that was actually Bosnian. Splitting the dictionary is what
// makes the separate codes mean something.
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
  // bs/hr/sr started as raw DeepL output, string by string with no context, and
  // it showed: the buddy system was described as a "mating" system, "Outgoing
  // HSG students" became "freshmen", and a submit button's in-flight label
  // "Sending…" came back as the imperative "Send". They are now translated with
  // full-document context against a pinned glossary (scripts/lib/glossary.mjs),
  // and the output is gated on scripts/lib/validate.mjs before it can land.
  { code: "bs", dict: "bs", label: "Bosanski", htmlLang: "bs", dateLocale: "bs-Latn-BA", ogLocale: "bs_BA", complete: true },
  { code: "hr", dict: "hr", label: "Hrvatski", htmlLang: "hr", dateLocale: "hr-HR", ogLocale: "hr_HR", complete: true },
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
