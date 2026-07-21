// Translation lookup. Dictionaries are plain JSON keyed by dotted paths, and
// anything missing falls back to English — so a half-finished locale renders a
// complete page in English rather than a blank or a raw key.
import en from "./en.json";
import de from "./de.json";
import bcs from "./bcs.json";
import sr from "./sr.json";
import { getLocale } from "./config.js";

const dictionaries = { en, de, bcs, sr };

function lookup(dict, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

/**
 * useTranslations("de") -> t("nav.events")
 * Falls back to English, then to the key itself (which makes an untranslated
 * string obvious in review rather than silently empty).
 */
export function useTranslations(code) {
  const dict = dictionaries[getLocale(code).dict] ?? en;
  return function t(key) {
    const value = lookup(dict, key);
    if (value !== undefined) return value;
    const fallback = lookup(en, key);
    return fallback !== undefined ? fallback : key;
  };
}
