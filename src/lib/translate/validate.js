// The gate. Nothing is written to disk until this passes.
//
// WHY THIS FILE EXISTS
//
// Every defect this checks for shipped to production and stayed there for
// months, while `npm test`, `npm run build`, `npm run check` and
// `npm run check:dist` all passed. That is the exact failure mode CLAUDE.md
// says to write tests for: bugs that are invisible to every other command.
// A page reading "Freshmen: we run no programme for students abroad" is not a
// build error. Neither is a buddy system described as a mating system.
//
// So: pure functions, no network, unit-tested in src/lib/translate/validate.test.js,
// and mutation-checked (break a rule, confirm a case fails). A validator nobody
// tested is itself a silent-failure surface.
//
// WHAT THIS CAN AND CANNOT DO
//
// It asserts MECHANICAL properties: key sets, placeholders, tag structure,
// pinned terminology, script, regional variant, glued tokens, split-sentence
// joins. It cannot judge whether a sentence reads naturally — that is why the
// pipeline also writes a review report for a human. Do not add a check here
// that pretends to measure fluency; add it to the report instead.
//
// SEVERITY IS DELIBERATE
//
//   error   — mechanically certain. Aborts the run.
//   warning — probably wrong, needs a human. Reported, does not abort.
//
// The split matters. "Output contains 'parenje'" is certain. "Output is missing
// the canonical term" is not: a translator may legitimately restructure a
// sentence so the pinned phrase appears in a different form. Making that an
// error would train whoever runs this to pass --no-verify, which is worse than
// not checking.

import {
  CYRILLIC_RE,
  FORBIDDEN_VARIANTS,
  LANGUAGES,
  PROTECTED,
  TERMS,
  VARIANT_FORMS,
} from "./glossary.js";
import { splitSentenceGroups } from "./flat.js";

// Letters of these languages, for word-boundary matching.
//
// JS \b is defined over [A-Za-z0-9_], so š/đ/č/ć/ž are NOT word characters and
// \b lands in the wrong place around them. A lookbehind over an explicit letter
// class is correct where \b is not: it is what stops the Bosnian marker "ko"
// from matching inside the perfectly good Croatian "tko".
const LETTER = "a-zA-Z\\u00c0-\\u024f";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const notPrecededByLetter = (stem) => new RegExp(`(?<![${LETTER}])${escapeRe(stem)}`, "iu");

/**
 * A regional-variant marker, compiled.
 *
 * Most markers are matched as a PREFIX so inflections are caught too — Ekavian
 * "mest-" is diagnostic in "mesto", "mestu", "mesta" alike. A few are only
 * diagnostic as a WHOLE WORD, because the marker is a strict prefix of oblique
 * forms that BOTH variants share: "vrijeme"/"vreme" decline to "vremena",
 * "vremenu", "vremenom" in Croatian, Bosnian AND Serbian — the jat reflex only
 * shows in the nominative/accusative. Prefix-matching "vreme" there flags
 * correct Croatian. A trailing "$" in the marker asks for the tighter match.
 */
const variantMarkerRe = (marker) => {
  const wholeWord = marker.endsWith("$");
  const stem = escapeRe(wholeWord ? marker.slice(0, -1) : marker);
  return new RegExp(`(?<![${LETTER}])${stem}${wholeWord ? `(?![${LETTER}])` : ""}`, "iu");
};

const problem = (severity, key, message, detail) => ({ severity, key, message, detail });

/** Tag names in order, e.g. ["a", "/a", "strong", "/strong"]. */
const tagSequence = (text) => (String(text).match(/<\/?[a-zA-Z][^>]*>/g) ?? []).map((t) =>
  t.replace(/<(\/?)\s*([a-zA-Z]+)[^>]*>/, "<$1$2>"),
);

const hrefs = (text) => (String(text).match(/href="([^"]*)"/g) ?? []).sort();

const placeholders = (text) => (String(text).match(/\{\w+\}/g) ?? []).sort();

/**
 * Two words run together: a lowercase letter immediately followed by an
 * uppercase one, mid-word. Catches "uSt. Gallenu", which shipped in both
 * locales.
 *
 * Note what NOT to do here. The obvious implementation strips protected names
 * first so their internal capitals can't false-positive — but "St. Gallen" is
 * itself protected, so stripping it turns "uSt. Gallenu" into "u Gallenu" and
 * deletes the evidence. No protected term currently contains this pattern
 * within a word, which validate.test.js asserts, so the raw string is the right
 * thing to test.
 */
const GLUED_RE = /[\p{Ll}][\p{Lu}]/u;

/**
 * Check one translated string against its English source.
 *
 * @param {string} source     the English value
 * @param {string} translated the candidate translation
 * @param {string} key        dotted key, for the message
 * @param {string} code       target language code
 */
export function checkString(source, translated, key, code) {
  const found = [];
  const src = String(source ?? "");
  const out = String(translated ?? "");

  if (out.trim() === "") {
    found.push(problem("error", key, "translation is empty"));
    return found;
  }

  // --- placeholders -------------------------------------------------------
  // Protecting a {placeholder} stops it being translated but does not stop it
  // being dropped: DeepL once returned "Портрет Елзе Јанец" for "Portrait of
  // {name}" — placeholder gone, invented person in its place.
  const wantVars = placeholders(src);
  const gotVars = placeholders(out);
  if (wantVars.join(",") !== gotVars.join(",")) {
    found.push(
      problem("error", key, "placeholders differ from the source", `expected ${wantVars.join(" ") || "none"}, got ${gotVars.join(" ") || "none"}`),
    );
  }

  // --- markup -------------------------------------------------------------
  // join.semesterBody shipped with one <strong> split into two in sr, and with
  // a case ending stranded outside the tag in bcs ("<strong>…YUnited</strong>a").
  const wantTags = tagSequence(src);
  const gotTags = tagSequence(out);
  if (wantTags.join("") !== gotTags.join("")) {
    found.push(
      problem("error", key, "HTML tag structure differs from the source", `expected ${wantTags.join(" ") || "none"}, got ${gotTags.join(" ") || "none"}`),
    );
  }
  const wantHrefs = hrefs(src);
  const gotHrefs = hrefs(out);
  if (wantHrefs.join("|") !== gotHrefs.join("|")) {
    found.push(problem("error", key, "a href was altered", `expected ${wantHrefs.join(" ")}, got ${gotHrefs.join(" ")}`));
  }

  // --- protected names ----------------------------------------------------
  // "Meet & Greet" -> "Susret i upoznavanje" is the second time that event name
  // broke; "Déja Vu Bar" -> "bar Deža Vju" left a venue nobody can search for.
  // Matched case-INSENSITIVELY on purpose. The letters are the load-bearing
  // part: "Déja Vu Bar" -> "Deža Vju" makes a real venue unsearchable, and
  // "Meet & Greet" -> "Susret i upoznavanje" loses the brand. Case is a style
  // question, and demanding an exact match on it produces false positives —
  // English writes "From Prvi Maj barbecues", while both target languages
  // correctly lowercase the month in running prose ("roštilja na Prvi maj").
  // Brand capitalization is separately policed on the built output by
  // scripts/check-dist.mjs, so nothing is left unchecked by this.
  const outLower = out.toLowerCase();
  for (const term of PROTECTED) {
    if (src.includes(term) && !outLower.includes(term.toLowerCase())) {
      found.push(problem("error", key, `protected name "${term}" is missing or altered`, out));
    }
  }

  // --- pinned terminology -------------------------------------------------
  // Scoped to strings whose SOURCE mentions the concept, which keeps the
  // substring matching honest: "praksa" is a real word and only wrong where the
  // English said "assessment".
  for (const [name, term] of Object.entries(TERMS)) {
    // `detect` scopes the check to strings whose ENGLISH mentions the concept.
    // That is what keeps stem matching honest: "praksa" is a real word, and only
    // wrong where the source said "assessment". An empty `detect` means the term
    // is prompt-only — no stem scopes it narrowly enough to check (see
    // TERMS.studentClub).
    const detect = term.detect ?? [term.en.split(" ")[0]];
    if (detect.length === 0) continue;
    if (!detect.some((stem) => notPrecededByLetter(stem).test(src))) continue;

    const forbidden = [...term.forbidden, ...(term.forbiddenIn?.[code] ?? [])];
    for (const bad of forbidden) {
      if (notPrecededByLetter(bad).test(out)) {
        found.push(problem("error", key, `forbidden rendering of "${term.en}": "${bad}"`, term.note ?? ""));
      }
    }
    const canonical = term.canonical[code];
    // Match on the longest word of the canonical phrase so a legitimately
    // reordered or inflected phrase still counts — see the severity note above.
    if (canonical) {
      const stem = canonical.split(" ").sort((a, b) => b.length - a.length)[0].slice(0, 6);
      if (!notPrecededByLetter(stem).test(out)) {
        found.push(problem("warning", `${key}`, `may be missing the pinned term for "${term.en}" (${name})`, `expected something like "${canonical}"`));
      }
    }
  }

  // --- script -------------------------------------------------------------
  if (LANGUAGES[code]?.script === "latin" && CYRILLIC_RE.test(out)) {
    found.push(problem("error", key, `contains Cyrillic, but ${code} is written in Latin script`, out));
  }

  // --- regional variant ---------------------------------------------------
  // Ekavian/Ijekavian consistency is one of the two things the old pipeline got
  // right. This is here to keep it through a rewrite.
  for (const set of FORBIDDEN_VARIANTS[code] ?? []) {
    for (const marker of VARIANT_FORMS[set]) {
      const stem = marker.trim();
      if (variantMarkerRe(stem).test(out)) {
        found.push(problem("error", key, `wrong variant for ${code}: "${stem.replace(/\$$/, "")}" is ${set}`, out));
      }
    }
  }

  // --- glued tokens -------------------------------------------------------
  // Both locales shipped "semestar uSt. Gallenu" — the preposition fused to the
  // city name. Skipped when the English does it too, so a source string with a
  // deliberate internal capital cannot make its translation unfixable.
  const glued = out.match(GLUED_RE);
  if (glued && !GLUED_RE.test(src)) {
    found.push(problem("error", key, `two words appear glued together ("${glued[0]}")`, out));
  }

  // --- padding ------------------------------------------------------------
  if (/\s{2,}/.test(out.trim())) {
    found.push(problem("warning", key, "contains a double space", out));
  }

  return found;
}

/**
 * Check a whole dictionary: per-string checks, plus the ones that only make
 * sense across keys.
 *
 * @param {Record<string,string>} source     flat English map
 * @param {Record<string,string>} translated flat candidate map
 * @param {string} code
 */
export function checkDictionary(source, translated, code) {
  const found = [];

  // --- key set ------------------------------------------------------------
  // A missing key silently falls back to English, so the page still renders and
  // nothing fails — the most invisible defect of the lot.
  for (const key of Object.keys(source)) {
    if (!(key in translated)) found.push(problem("error", key, "key missing from the translation"));
  }
  for (const key of Object.keys(translated)) {
    if (!(key in source)) found.push(problem("error", key, "key invented — not present in the source"));
  }

  for (const [key, value] of Object.entries(source)) {
    if (!(key in translated)) continue;
    if (typeof value !== "string") continue;
    found.push(...checkString(value, translated[key], key, code));
  }

  found.push(...checkSplitSentences(source, translated, code));
  return found;
}

/**
 * The …Pre / …Link / …Post sets, checked as sentences rather than fragments.
 *
 * All four sets (two per locale) shipped broken. bcs joined to "…studentima na
 * razmjena stranice." — nominative + genitive glued together, failing to agree
 * with the "na" that precedes it. bcs's other set ended "…samo pružiti ruku."
 * — a bare infinitive after "just", because "reach out" was translated as a
 * dictionary headword.
 */
export function checkSplitSentences(source, translated, code) {
  const found = [];
  for (const [base, parts] of Object.entries(splitSentenceGroups(source))) {
    const get = (part) => (parts[part] ? translated[parts[part]] : undefined);
    const pre = get("Pre");
    const link = get("Link");
    const post = get("Post");
    if (pre === undefined || link === undefined) continue;

    const joined = `${pre}${link}${post ?? ""}`;

    // A Pre that ends a sentence means the link is left dangling after it —
    // German's exchange line shipped exactly this way ("den Kontakt her." then
    // "Kontakt aufnehmen").
    if (/[.!?]\s*$/.test(pre)) {
      found.push(problem("error", parts.Pre, "Pre fragment ends the sentence, so the link runs on after a full stop", pre));
    }
    // check-dist.mjs already fails the BUILD on a link glued to the character
    // before it (the footer once read "managed on**uniclubs.ch**"). Catch it
    // here instead, before it is committed. Driven off the source's own spacing
    // rather than a guess: whatever separator English uses, the translation
    // needs the same one.
    const srcPre = source[parts.Pre];
    if (/\s$/.test(String(srcPre)) && !/\s$/.test(pre)) {
      found.push(
        problem("error", parts.Pre, "Pre fragment lost its trailing space, so the link will be glued to the preceding word", JSON.stringify(pre)),
      );
    }
    // An infinitive cannot follow "just" / "samo" — bcs shipped "…samo pružiti
    // ruku." The verb may carry an object, so match the head word only.
    if (/^\s*\p{L}+(ti|ći)(\s|$)/iu.test(link) && code !== "de") {
      found.push(problem("warning", parts.Link, "Link fragment looks like a bare infinitive; it should be a noun phrase in the case the preposition governs", link));
    }
    if (/\s{2,}/.test(joined)) {
      found.push(problem("warning", base, "joined sentence contains a double space", joined));
    }
  }
  return found;
}

/** Errors only. The run aborts on these. */
export const errorsOf = (found) => found.filter((f) => f.severity === "error");

/**
 * Format findings for a terminal or a workflow log. Errors first — if the run
 * aborted, the reason should be the first thing on screen.
 */
export function formatFindings(found, label) {
  if (found.length === 0) return `✓ ${label}: clean`;
  const lines = [`${label}:`];
  for (const f of [...found].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))) {
    lines.push(`  ${f.severity === "error" ? "✗" : "⚠"} ${f.key} — ${f.message}`);
    if (f.detail) lines.push(`      ${String(f.detail).slice(0, 160)}`);
  }
  return lines.join("\n");
}
