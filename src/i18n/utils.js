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

// Fill {placeholders} from a vars object: "Photo from {title}" + {title: "Prvi
// Maj"} -> "Photo from Prvi Maj". A placeholder with no matching var is left
// as-is so the gap is visible in review rather than silently blank.
function interpolate(text, vars) {
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] !== undefined ? String(vars[name]) : match
  );
}

/**
 * useTranslations("de") -> t("nav.events")
 * Falls back to English, then to the key itself (which makes an untranslated
 * string obvious in review rather than silently empty).
 *
 * Pass vars for strings with {placeholders}: t("events.photoAlt", { title }).
 */
export function useTranslations(code) {
  const dict = dictionaries[getLocale(code).dict] ?? en;
  return function t(key, vars) {
    const value = lookup(dict, key);
    const resolved = value !== undefined ? value : lookup(en, key);
    if (resolved === undefined) return key;
    return vars && typeof resolved === "string" ? interpolate(resolved, vars) : resolved;
  };
}
