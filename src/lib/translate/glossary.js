// The single source of translation policy for this site.
//
// This file replaces the old `PROTECT` list in deepl.js and is shared by both
// translation scripts — the same one-copy rationale that file already argued:
// a term pinned in one place and not the other is how "YUnited" quietly becomes
// "Vereinigt" in event descriptions only.
//
// WHY THIS FILE IS THE DELIVERABLE
//
// The previous pipeline sent each string to DeepL on its own, with no context
// beyond a brand-name blocklist. Every defect class that shipped follows from
// that, and none of them is a vendor bug:
//
//   * "Sending…" (a button's in-flight state) came back as "Pošalji…" — the
//     imperative "Send". With no context, the -ing form is ambiguous.
//   * `about.buddyMoreLink` ("exchange page") came back as "razmjena stranice"
//     — nominative + genitive glued together, because the fragment was
//     translated as a standalone headword with no knowledge of the "na" that
//     precedes it in the sentence it belongs to.
//   * The buddy system acquired FOUR names per language, because each mention
//     was translated independently.
//
// So the policy below is not a list of preferences. Each entry exists because
// its absence produced a specific, shipped defect. Read TERMS as a changelog of
// things that went wrong.
//
// Everything here is machine-checkable on purpose: the same constants build the
// model's system prompt AND drive src/lib/translate/validate.js. A rule that can only
// be expressed as prose in the prompt is a rule nothing enforces.

/**
 * The target languages.
 *
 * `bs` and `hr` were ONE dictionary ("bcs") until this change. That file was
 * overwhelmingly Croatian (sustav, sveučilište, inozemstvo, svibnja) with stray
 * Bosnian forms mixed in — the same university appeared as "Sveučilištu u St.
 * Gallenu" three times and "Univerzitetu St. Gallen" three times in one file.
 * Bosnian readers were served inconsistent Croatian. They are separate now.
 *
 * `script: "latin"` on `sr` is load-bearing: src/i18n/config.js declares
 * htmlLang "sr-Latn" and dateLocale "sr-Latn-RS", so Cyrillic output would
 * contradict the page's own language tag.
 */
export const LANGUAGES = {
  de: {
    name: "German",
    variety: "Swiss Standard German",
    script: "latin",
    // This is a Swiss club: the rest of the copy is Swiss orthography
    // (ausschliesslich, heissen, grosse), so ß is simply wrong here.
    rules: ["Swiss orthography: always 'ss', never 'ß'."],
  },
  hr: {
    name: "Croatian",
    variety: "Croatian standard, Ijekavian",
    script: "latin",
    rules: [
      "Ijekavian reflexes: mjesto, gdje, vrijeme, lijep, razmjena, prije.",
      "Croatian lexis: što (not šta), sveučilište (not univerzitet), inozemstvo (not inostranstvo), tjedan (not sedmica), tisuća (not hiljada), tko (not ko).",
    ],
  },
  bs: {
    name: "Bosnian",
    variety: "Bosnian standard, Ijekavian",
    script: "latin",
    rules: [
      "Ijekavian reflexes: mjesto, gdje, vrijeme, lijep, razmjena, prije.",
      "Bosnian lexis: šta (not što), univerzitet (not sveučilište), inostranstvo (not inozemstvo), sedmica (not tjedan), hiljada (not tisuća), ko (not tko).",
      "Use international month names (maj, juni), not the Croatian series (svibanj, lipanj).",
    ],
  },
  sr: {
    name: "Serbian",
    variety: "Serbian standard, Ekavian, Latin script",
    script: "latin",
    rules: [
      "LATIN SCRIPT ONLY. Never Cyrillic — the page declares lang=\"sr-Latn\".",
      "Ekavian reflexes: mesto, gde, vreme, lep, razmena, pre. Never the Ijekavian mjesto/gdje/vrijeme/razmjena.",
      "Serbian lexis: univerzitet, inostranstvo, nedelja.",
    ],
  },
};

export const TARGET_CODES = Object.keys(LANGUAGES);

/**
 * Terms that must appear VERBATIM in the output, never translated or
 * transliterated.
 *
 * The German dictionary is the precedent for every one of these: it keeps
 * "Meet & Greet", "Global Village" and "Déja Vu Bar" untouched, which is why
 * German never suffered this defect class. Two shipped counter-examples:
 *
 *   * "Meet & Greet" → "Susret i upoznavanje" (bcs and sr). This is the SECOND
 *     time this exact event name broke; it previously shipped as "Srećem i
 *     pozdravljam" ("I meet and I greet"). It is a brand the club advertises
 *     under on Instagram, and its own file is named meet-and-greet-2026.json.
 *   * "Déja Vu Bar" → "bar Deža Vju" (sr) — a phonetic mangling nobody can
 *     search for, sitting on the same card as the untranslated `location`
 *     field, which still reads "Déja Vu Bar, St. Gallen".
 *
 * Longest first so "uniclubs.ch" wins over "uniclubs" in a single-pass match.
 */
export const PROTECTED = [
  // Brand and organisations.
  "yunited@shsg.ch",
  "@yunited.unisg",
  "uniclubs.ch",
  "uniclubs",
  "YUnited",
  "AIESEC",
  "SHSG",
  "HSG",
  "Instagram",
  "Formspree",
  "CHF",
  // Event names. Each is the name of a thing, not a description of it.
  "Meet & Greet",
  "Global Village",
  "Prvi Maj",
  "Svadba", // the film screened at Movie Night, not the common noun "wedding"
  // Venues and places. Translating an address corrupts directions to a real place.
  "Déja Vu Bar",
  "St. Gallen",
  // Placeholders filled by t(key, vars) at render time. DeepL once returned
  // "Портрет Елзе Јанец" for "Portrait of {name}" — placeholder gone, invented
  // person in its place.
  "{title}",
  "{name}",
].sort((a, b) => b.length - a.length);

/**
 * One concept, one word — per language.
 *
 * `canonical` is what the translation must use. `forbidden` are renderings that
 * actually shipped, or that are wrong in a way worth blocking by name. The
 * validator asserts the canonical form appears and no forbidden form does.
 *
 * Where a canonical form was already chosen by hand in this repo's history, it
 * is preserved rather than re-decided — see the `buddySystem` note.
 */
export const TERMS = {
  buddySystem: {
    en: "buddy system",
    detect: ["buddy"],
    // "sustav prijatelja"/"sistem prijatelja" was hand-chosen in commit bad1e4b
    // ("sr: write Serbian in Latin") and held until 2026-08-27, when it was
    // deliberately replaced: a literal "system of friends" undersells what the
    // programme actually is, and "kumstvo" — the traditional Balkan god-parent/
    // sponsor kinship — reads as a real cultural institution rather than an
    // admin process. Balkan-language decision only; German keeps its own
    // "Buddy-System" loanword untouched (see the forbidden note below).
    canonical: { hr: "kumstvo", bs: "kumstvo", sr: "kumstvo" },
    // bcs.json shipped FOUR names for this one programme and sr.json four more,
    // before "sustav/sistem prijatelja" was pinned; both of those are now
    // themselves forbidden, so a future auto-translation can't quietly regress
    // to the literal rendering this term replaced. "parenje" is mating/
    // copulation (of animals): about.buddyLede once read "naš sustav
    // prijateljskog parenja", on the About page. "mentorstvo" is a register
    // error rather than a howler — a buddy is a peer, a mentor is a senior —
    // but it still has to go.
    forbidden: ["parenj", "buddy-", "mentor", "sustav prijatelj", "sistem prijatelj"],
    note: "A peer who has already been through it — NOT a mentor, never a form of 'parenje' (mating), and (Balkan languages) not the old literal 'sustav/sistem prijatelja' — kumstvo is the pinned term as of 2026-08-27.",
  },

  assessmentYear: {
    en: "Assessment year",
    detect: ["assessment"],
    // HSG's first year. It is called "Assessment" in English at HSG itself, so
    // the English word is the correct term in every language — exactly like a
    // course code. Declined where the sentence needs it.
    canonical: { hr: "Assessment", bs: "Assessment", sr: "Assessment" },
    // SEVEN distinct wrong renderings shipped across the two files: praksa
    // (internship — the club does not serve interns), procjena (appraisal),
    // ocjenjivačka godina (grading year), godina procene, godine ocenjivanja,
    // pripremna godina (preparatory year), studijski boravci (which just means
    // "exchange" again, so the sentence named the same group twice).
    forbidden: ["praks", "procjen", "procen", "ocjenjiv", "ocenjiv", "pripremn", "boravc"],
    note: "HSG's first study year, called 'Assessment' in English at HSG. Not an internship, not an appraisal, not a preparatory year.",
  },

  board: {
    en: "board",
    detect: ["board"],
    canonical: { hr: "odbor", bs: "odbor", sr: "odbor" },
    // "upravni odbor" is specifically a corporation's board of directors or
    // supervisory board — the corporate register the club must not adopt. It
    // shipped twice in bcs.json plus once in meet-and-greet-2026.json. "uprava"
    // (management) has the same problem and was ALSO used for nav.members,
    // relabelling a "Members" nav item as the governing body.
    //
    // STEMS, not full inflections. An earlier version of this list spelled out
    // "upravni odbor" and "upravnog odbora" and then sailed past the shipped
    // "upravnom odboru" — these languages inflect, so a forbidden form has to be
    // matched on its stem or it only catches the cases someone happened to type.
    forbidden: ["uprav"],
    note: "A student club's committee. Never the corporate 'upravni odbor' (board of directors) or 'uprava' (management).",
  },

  incomingStudents: {
    en: "incoming exchange students",
    detect: ["incoming"],
    canonical: {
      hr: "studenti na razmjeni koji dolaze",
      bs: "studenti na razmjeni koji dolaze",
      sr: "studenti na razmeni koji dolaze",
    },
    // sr.json rendered incoming/outgoing as "ulazni"/"ishodni" — the
    // input/output sense, as of a machine or a data pipeline.
    forbidden: ["ulazn", "dolazeć"],
    note: "Students arriving at HSG for a semester. NOT 'ulazni' (input/inlet).",
  },

  outgoingStudents: {
    en: "outgoing HSG students",
    detect: ["outgoing"],
    canonical: {
      hr: "studenti HSG-a koji odlaze na razmjenu",
      bs: "studenti HSG-a koji odlaze na razmjenu",
      sr: "studenti HSG-a koji odlaze na razmenu",
    },
    // The worst single defect on the site: exchange.outgoingHeading shipped as
    // "Budući studenti HSGa" (prospective students) in bcs and "Brucoši HSG-a"
    // (freshmen) in sr. Both sit directly above the line "YUnited runs no
    // formal programme for students abroad", so the page read "Freshmen: we run
    // no programme for students abroad."
    forbidden: ["ishodn", "buduć", "brucoš"],
    note: "HSG students going abroad. NOT prospective students, NOT freshmen, NOT 'ishodni' (output).",
  },

  midterm: {
    en: "midterm exams",
    detect: ["midterm"],
    canonical: { hr: "međuispiti", bs: "međuispiti", sr: "kolokvijumi" },
    // "srednji rok" is "medium term / middle deadline" — meaningless, and
    // contradicted by its own description one line later ("na sredini
    // semestra"). "srednji ispiti" reads as secondary-school exams.
    forbidden: ["srednj"],
    note: "Exams in the middle of the semester.",
  },

  recap: {
    en: "recaps",
    detect: ["recap"],
    canonical: { hr: "sažeci", bs: "sažeci", sr: "sažeci" },
    // "rekapi" is not a word in any of these languages. bcs got this right
    // ("Sažeci"); sr invented an anglicism.
    forbidden: ["rekap"],
  },

  inbox: {
    en: "inbox",
    detect: ["inbox"],
    canonical: { hr: "sandučić", bs: "sandučić", sr: "sandučić" },
    // Raw transliterated English in sr. This string has a history: it once
    // called the board inbox a "forum".
    forbidden: ["inboks", "forum"],
  },

  freeTier: {
    en: "free tier",
    detect: ["free tier"],
    canonical: { hr: "besplatni paket", bs: "besplatni paket", sr: "besplatni paket" },
    // "besplatni nivo" is "free level".
    forbidden: ["nivo"],
  },

  semester: {
    en: "semesters",
    detect: ["semester"],
    canonical: { hr: "semestri", bs: "semestri", sr: "semestri" },
    // sr turned "across all majors and semesters" into "godine studija"
    // (years of study), which is a different span.
    forbidden: ["godina studija", "godinama studija"],
  },

  studentClub: {
    en: "student club",
    // Prompt-only: "student" and "club" appear in most strings on the site, so
    // there is no stem that scopes this narrowly enough to check mechanically.
    // An empty `detect` means validate.js skips it and only the prompt carries it.
    detect: [],
    canonical: { hr: "studentski klub", bs: "studentski klub", sr: "studentski klub" },
    // Never shipped for YUnited itself, but it shipped once before and the
    // board flagged it: the club is not a company. (Note "tvrtka"/"kompanija"
    // ARE correct where the English says "companies" about third parties, so
    // this is checked against club-referring keys only — see validate.js.)
    forbidden: [],
    note: "YUnited is an association/club, never a tvrtka/firma/kompanija (company).",
  },
};

/**
 * Morphology the brand list must NOT freeze.
 *
 * PROTECTED keeps these strings intact; these two additionally have to inflect,
 * and both failed uniformly:
 *
 *   * sr.json never declined St. Gallen — 10 of 10 occurrences read "u St.
 *     Gallen" where Serbian requires "u St. Gallenu". bcs got it right 6 of 7.
 *   * HSG appeared as HSG, HSG-a, HSG-u, and the unhyphenated HSGa / HSGu.
 */
export const MORPHOLOGY = [
  "Decline 'St. Gallen' as the sentence requires: 'u St. Gallenu', 'iz St. Gallena'. Never leave it bare after a preposition that governs a case.",
  "Attach HSG case endings with a hyphen: 'HSG-a', 'HSG-u', 'na HSG-u'. Never 'HSGa' or 'HSGu'.",
  // Precision matters here. "Keep protected names invariant" is too broad: a case
  // ending on a name in ordinary use is correct Croatian/Bosnian/Serbian, and
  // banning it forces stilted prose ("na našem Instagram profilu" everywhere).
  // What must never happen is TRANSLATION or TRANSLITERATION — "Déja Vu" becoming
  // "Deža Vju", or "Meet & Greet" becoming "Susret i upoznavanje".
  "A grammatical case ending on a name in ordinary use is fine and often required: 'na Instagramu', 'na HSG-u'.",
  "But the brand YUnited and the multi-word event and venue names — Meet & Greet, Global Village, Déja Vu Bar, Prvi Maj, Svadba — stay in their base form. Phrase around them ('klubu YUnited', 'kluba YUnited') rather than inflecting them.",
];

/**
 * Address form: informal throughout.
 *
 * EVIDENCE, not preference. de.json is already informal — "Verbringst du ein
 * Semester in St. Gallen?", "Werde Mitglied bei YUnited" — so informal is the
 * site's established voice, and it suits a student club addressing fellow
 * students. English is neutral and gives no signal either way.
 *
 * What shipped was neither: formal and informal collided inside single screens.
 * On the sr home page, `heroJoin` ("Pridruži se", informal) sits next to
 * `heroEvents` ("Pogledajte", formal); the bcs about/buddy block alternates
 * across four consecutive keys. The two dictionaries also disagreed with each
 * other on the same pair of buttons.
 *
 * One constant, so the decision is reversible with a one-word edit and a re-run.
 */
export const ADDRESS_FORM = {
  form: "informal",
  instruction:
    "Address the reader in the INFORMAL second person singular (ti) throughout — verbs, pronouns and possessives. " +
    "This matches the German dictionary, which already uses 'du'. Never mix in the formal 'vi'/'Vi' plural, " +
    "and never switch form between two strings: they appear side by side on the same page.",
};

/** Cyrillic, for the script assertion on Serbian. */
export const CYRILLIC_RE = /[Ѐ-ӿ]/;

/**
 * Forms that give away the wrong regional variant.
 *
 * Ekavian/Ijekavian consistency was, notably, one of the two things the old
 * pipeline got RIGHT: every value in sr.json is Ekavian and every value in
 * bcs.json is Ijekavian. This exists to keep it that way through a rewrite, not
 * to fix a live defect.
 *
 * The hr/bs lexis split is a live defect: bcs.json had 11 Croatian "što"
 * against 1 Bosnian "Šta", inozemstvo x4 against inostranstvo x1, and three
 * spellings of "brunch".
 */
export const VARIANT_FORMS = {
  // Ijekavian markers — wrong in Serbian.
  ijekavian: ["mjesto", "gdje", "vrijeme", "lijep", "razmjen", "prije", "korijen", "ovdje", "poslije", "smjer", "vjera", "uvijek", "čovjek", "djec", "sljedeć", "vrijedn", "zabiljež", "tjedan"],
  // Ekavian markers — wrong in Croatian and Bosnian.
  ekavian: ["mesto", "gde", "vreme", "razmen", "koren", "ovde", "posle", "smer", "uvek", "čovek", "sledeć", "vrednost", "zabelež"],
  // Croatian-only lexis — wrong in Bosnian.
  croatianOnly: ["sveučilišt", "inozemstv", "tisuć", "tjedan", "tko ", "svibnj", "lipnj", "srpnj", "sustav"],
  // Bosnian/Serbian lexis — wrong in Croatian.
  bosnianOnly: ["univerzitet", "inostranstv", "hiljad", "sedmic", "šta ", "ko smo"],
};

/** Which VARIANT_FORMS sets are forbidden in which target language. */
export const FORBIDDEN_VARIANTS = {
  de: [],
  hr: ["ekavian", "bosnianOnly"],
  bs: ["ekavian", "croatianOnly"],
  sr: ["ijekavian", "croatianOnly"],
};

// systemPrompt()/languagePrompt() — the free-text instructions built from
// TERMS/MORPHOLOGY/ADDRESS_FORM for Claude's system prompt — were removed with
// scripts/lib/claude.mjs (the en->hr/bs/sr DeepL migration, PLAN.md §4). DeepL
// cannot be handed a prose instruction, only PROTECTED terms (via tag_handling)
// and per-string context; TERMS/MORPHOLOGY/ADDRESS_FORM stay as the recorded
// policy and as what validate.js checks on the output, which is now the only
// enforcement mechanism for pinned terminology.
