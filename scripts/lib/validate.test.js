// Tests for the translation gate.
//
// The cases are not invented. Almost every one is a string that actually
// shipped to production and stayed there, so this file doubles as the record of
// what went wrong: if a future change makes one of these pass, the site has
// regressed to a state it has already been in.
//
// Each check is MUTATION-CHECKED: the test asserts both that the real defect is
// caught and that the corrected string is clean. A validator that flags
// everything is as useless as one that flags nothing, and only the pair of
// assertions distinguishes them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkString, checkDictionary, checkSplitSentences, errorsOf } from "./validate.mjs";
import { PROTECTED, TERMS } from "./glossary.mjs";
import { flatten, unflatten, splitSentenceGroups } from "./flat.mjs";

const errs = (...args) => errorsOf(checkString(...args));
// Key AND message: a finding is only useful if it says which string is wrong,
// so the assertions check both halves.
const messages = (found) => found.map((f) => `${f.key} — ${f.message}`).join(" | ");

// --- protected names ---------------------------------------------------------

test("a translated event name is caught — the 'Meet & Greet' class", () => {
  const src = "Meet & Greet";
  // Shipped in both bcs.json and sr.json. Previously shipped as "Srećem i
  // pozdravljam" ("I meet and I greet"), so this is the second regression.
  const bad = errs(src, "Susret i upoznavanje", "events.meetGreet", "sr");
  assert.ok(bad.length > 0, "translating the event name must fail");
  assert.match(messages(bad), /protected name "Meet & Greet"/);

  // German keeps it, which is the convention the others must follow.
  assert.equal(errs(src, "Meet & Greet", "events.meetGreet", "de").length, 0);
});

test("a phonetically mangled venue is caught — the 'Deža Vju' class", () => {
  const src = "Karaoke night at Déja Vu Bar.";
  const bad = errs(src, "Karaoke veče u baru Deža Vju.", "karaoke.description", "sr");
  assert.ok(bad.length > 0);
  assert.match(messages(bad), /Déja Vu Bar/);

  assert.equal(errs(src, "Karaoke veče u baru Déja Vu Bar.", "karaoke.description", "sr").length, 0);
});

test("a protected name may follow the target language's capitalisation", () => {
  // English writes "From Prvi Maj barbecues"; both target languages correctly
  // lowercase the month in running prose. The letters are what matter — an exact
  // case match here was a false positive on live copy, and brand capitalisation
  // is already policed on the built output by scripts/check-dist.mjs.
  const src = "From Prvi Maj barbecues to karaoke nights";
  const found = errs(src, "Od roštilja na Prvi maj do karaoke večeri", "home.whoBody", "hr");
  assert.equal(errorsOf(found).length, 0, messages(found));

  // Changed LETTERS are still an error.
  assert.match(messages(errs(src, "Od roštilja na Prvog Maja do karaoke", "home.whoBody", "hr")), /Prvi Maj/);
});

test("every protected term is checked, not just a hand-picked few", () => {
  for (const term of PROTECTED) {
    if (term.startsWith("{")) continue; // placeholders have their own check
    const src = `Prefix ${term} suffix.`;
    const found = errs(src, "Prefix ZZZ suffix.", "some.key", "sr");
    assert.ok(found.length > 0, `dropping "${term}" should be an error`);
  }
});

// --- pinned terminology ------------------------------------------------------

test("the buddy system is never a mating system", () => {
  const src = "Our buddy system pairs you with someone who has already been through it.";
  // src/i18n/bcs.json:115 — shipped, on the About page. "parenje" is
  // mating/copulation (of animals).
  const bad = errs(src, "Naš sustav prijateljskog parenja povezuje vas s nekim.", "about.buddyLede", "hr");
  assert.ok(bad.length > 0);
  assert.match(messages(bad), /forbidden rendering of "buddy system"/);

  const good = errs(src, "Naš sustav prijatelja povezuje te s nekim.", "about.buddyLede", "hr");
  assert.equal(good.length, 0, messages(good));
});

test("the buddy system is not a mentorship — a peer is not a senior", () => {
  const src = "Our buddy system offers guidance.";
  const bad = errs(src, "Naš sistem mentorstva pruža smernice.", "about.missionP4", "sr");
  assert.match(messages(bad), /forbidden rendering of "buddy system"/);
});

test("HSG's Assessment year is not an internship, an appraisal or a grading year", () => {
  const src = "guidance for assessment and exchange students";
  // Seven distinct wrong renderings shipped across the two files.
  for (const shipped of [
    "smernice studentima na praksi", // sr — internship
    "smjernice studentima na procjeni", // hr — appraisal
    "studenti ocjenjivačke godine", // hr — grading year
    "od pripremne godine do magistarskog studija", // hr — preparatory year
  ]) {
    const bad = errs(src, shipped, "about.missionP4", "hr");
    assert.ok(bad.length > 0, `"${shipped}" should be rejected`);
    assert.match(messages(bad), /Assessment year/);
  }

  const good = errs(src, "smjernice Assessment i studentima na razmjeni", "about.missionP4", "hr");
  assert.equal(errorsOf(good).length, 0, messages(good));
});

test("the club's committee is not a corporate board of directors", () => {
  const src = "Take on board roles";
  const bad = errs(src, "Preuzmi uloge u upravnom odboru", "members.involvedBody", "hr");
  assert.match(messages(bad), /forbidden rendering of "board"/);

  assert.equal(errs(src, "Preuzmi uloge u odboru", "members.involvedBody", "hr").length, 0);
});

test("outgoing students are neither prospective students nor freshmen", () => {
  const src = "Outgoing HSG students";
  // The worst defect on the site: this heading sits above "YUnited runs no
  // formal programme for students abroad", so the page read
  // "Freshmen: we run no programme for students abroad."
  assert.match(messages(errs(src, "Budući studenti HSG-a", "exchange.outgoingHeading", "hr")), /outgoing/i);
  assert.match(messages(errs(src, "Brucoši HSG-a", "exchange.outgoingHeading", "sr")), /outgoing/i);
});

test("incoming students are not 'input' students", () => {
  const src = "Incoming exchange students";
  assert.match(messages(errs(src, "Ulazni studenti na razmenu", "exchange.incomingHeading", "sr")), /incoming/i);
});

test("invented anglicisms are caught: rekap, inboks", () => {
  assert.match(messages(errs("Recaps", "Rekapi", "events.pastEyebrow", "sr")), /recaps/i);
  assert.match(
    messages(errs("Your message goes straight to the inbox", "Poruka ide u inboks", "contact.formNote", "sr")),
    /inbox/i,
  );
});

test("a forbidden stem is not flagged when the source never mentioned the concept", () => {
  // "praksa" is a perfectly good word. It is only wrong where the English said
  // "assessment" — this is what keeps the substring matching honest.
  const found = errs("Good practice in our community", "Dobra praksa u našoj zajednici", "some.key", "sr");
  assert.equal(errorsOf(found).length, 0, messages(found));
});

// --- script and regional variant --------------------------------------------

test("Cyrillic in Serbian is an error — the page declares sr-Latn", () => {
  const bad = errs("Values", "Вредности", "toc.values", "sr");
  assert.match(messages(bad), /Cyrillic/);
  assert.equal(errs("Values", "Vrednosti", "toc.values", "sr").length, 0);
});

test("Ekavian in Croatian and Ijekavian in Serbian are both caught", () => {
  // This is the one thing the old pipeline got right; the gate exists to keep it.
  assert.match(messages(errs("Exchange", "Razmena", "nav.exchange", "hr")), /wrong variant for hr/);
  assert.match(messages(errs("Exchange", "Razmjena", "nav.exchange", "sr")), /wrong variant for sr/);

  assert.equal(errs("Exchange", "Razmjena", "nav.exchange", "hr").length, 0);
  assert.equal(errs("Exchange", "Razmena", "nav.exchange", "sr").length, 0);
});

test("Croatian-only lexis is rejected in Bosnian, and vice versa", () => {
  // bcs.json served BOTH languages and mixed them: the same university appeared
  // as "Sveučilištu u St. Gallenu" x3 and "Univerzitetu St. Gallen" x3.
  assert.match(messages(errs("university", "sveučilište", "x.y", "bs")), /wrong variant for bs/);
  assert.match(messages(errs("university", "univerzitet", "x.y", "hr")), /wrong variant for hr/);
});

test("the Bosnian 'ko' marker does not false-positive on the Croatian 'tko'", () => {
  // A plain substring check flags "tko" because it contains "ko". Word-boundary
  // matching over a diacritic-aware letter class is why this passes.
  const found = errs("Who we are", "Tko smo mi", "toc.who", "hr");
  assert.equal(errorsOf(found).length, 0, messages(found));
});

// --- structure ---------------------------------------------------------------

test("a split <strong> tag is caught", () => {
  const src = "Access to <strong>all YUnited events</strong> for the semester:";
  // src/i18n/sr.json — one <strong> became two, with an unbolded space between.
  const bad = errs(src, "Pristup <strong>svim događajima</strong> <strong>YUnited</strong> tokom semestra:", "join.semesterBody", "sr");
  assert.match(messages(bad), /HTML tag structure/);
});

test("an altered href is caught", () => {
  const src = 'Follow us on <a href="https://www.instagram.com/yunited.unisg">Instagram</a>.';
  const bad = errs(src, 'Prati nas na <a href="https://instagram.com/yunited">Instagram</a>.', "x.y", "sr");
  assert.match(messages(bad), /href was altered/);
});

test("a dropped placeholder is caught", () => {
  // DeepL once returned "Портрет Елзе Јанец" for "Portrait of {name}" —
  // placeholder gone, invented person in its place.
  const bad = errs("Portrait of {name}", "Portret Ane Marić", "members.portraitAlt", "sr");
  assert.match(messages(bad), /placeholders differ/);
  assert.equal(errs("Portrait of {name}", "Portret {name}", "members.portraitAlt", "sr").length, 0);
});

test("a glued preposition is caught — the 'uSt.' typo", () => {
  const src = "Spending a semester in St. Gallen?";
  // Shipped in BOTH locales, same corruption, same key.
  const bad = errs(src, "Provodiš semestar uSt. Gallenu?", "exchange.incomingLede", "hr");
  assert.match(messages(bad), /glued together/);

  const good = errs(src, "Provodiš semestar u St. Gallenu?", "exchange.incomingLede", "hr");
  assert.equal(errorsOf(good).length, 0, messages(good));
});

test("internal capitals in a protected name do not trip the glued-token check", () => {
  // "YUnited" is lowercase-then-uppercase by design. Stripping protected names
  // before the check is what stops every string mentioning the club failing.
  const found = errs("Join YUnited today", "Pridruži se YUnited danas", "x.y", "hr");
  assert.equal(errorsOf(found).length, 0, messages(found));
});

test("an empty translation is an error, not a silent pass", () => {
  assert.match(messages(errs("Events", "", "nav.events", "sr")), /empty/);
  assert.match(messages(errs("Events", "   ", "nav.events", "sr")), /empty/);
});

// --- dictionary-level --------------------------------------------------------

test("a missing key is an error — it would silently fall back to English", () => {
  const source = { "nav.events": "Events", "nav.about": "About" };
  const found = errorsOf(checkDictionary(source, { "nav.events": "Događaji" }, "sr"));
  assert.match(messages(found), /nav\.about — key missing/);
});

test("an invented key is an error", () => {
  const source = { "nav.events": "Events" };
  const found = errorsOf(checkDictionary(source, { "nav.events": "Događaji", "nav.ghost": "X" }, "sr"));
  assert.match(messages(found), /nav\.ghost — key invented/);
});

test("a clean dictionary produces no errors", () => {
  const source = { "nav.events": "Events", "nav.members": "Members" };
  const translated = { "nav.events": "Događaji", "nav.members": "Članovi" };
  const found = errorsOf(checkDictionary(source, translated, "sr"));
  assert.deepEqual(found, [], messages(found));
});

// --- split sentences ---------------------------------------------------------

const SPLIT_SOURCE = {
  "about.buddyMorePre": "There is more detail on what we offer students on the ",
  "about.buddyMoreLink": "exchange page",
  "about.buddyMorePost": ".",
};

test("a Pre fragment that lost its trailing space is caught", () => {
  // check-dist.mjs fails the build on a link glued to the preceding character;
  // this catches it before the commit instead.
  const found = errorsOf(
    checkSplitSentences(SPLIT_SOURCE, {
      "about.buddyMorePre": "Više detalja o tome što nudimo studentima na",
      "about.buddyMoreLink": "stranici o razmjeni",
      "about.buddyMorePost": ".",
    }, "hr"),
  );
  assert.match(messages(found), /lost its trailing space/);
});

test("a Pre fragment that ends the sentence is caught", () => {
  // German's exchange line shipped exactly this way: "…den Kontakt her." then
  // the link "Kontakt aufnehmen" ran on after the full stop.
  const found = errorsOf(
    checkSplitSentences(SPLIT_SOURCE, {
      "about.buddyMorePre": "Više detalja nudimo studentima. ",
      "about.buddyMoreLink": "stranici o razmjeni",
      "about.buddyMorePost": ".",
    }, "hr"),
  );
  assert.match(messages(found), /ends the sentence/);
});

test("a bare-infinitive Link fragment is flagged", () => {
  // bcs shipped "…samo pružiti ruku." — an infinitive after "just", because
  // "reach out" was translated as a dictionary headword.
  const source = {
    "exchange.outgoingItem3Pre": "we'll gladly connect you — just ",
    "exchange.outgoingItem3Link": "reach out",
    "exchange.outgoingItem3Post": ".",
  };
  const found = checkSplitSentences(source, {
    "exchange.outgoingItem3Pre": "rado ćemo te povezati — samo ",
    "exchange.outgoingItem3Link": "pružiti ruku",
    "exchange.outgoingItem3Post": ".",
  }, "hr");
  assert.match(messages(found), /bare infinitive/);
});

test("a correctly split sentence passes", () => {
  const found = checkSplitSentences(SPLIT_SOURCE, {
    "about.buddyMorePre": "Više detalja o tome što nudimo studentima na ",
    "about.buddyMoreLink": "stranici o razmjeni",
    "about.buddyMorePost": ".",
  }, "hr");
  assert.deepEqual(errorsOf(found), [], messages(found));
});

test("split groups need both a Pre and a Link to be a group", () => {
  assert.deepEqual(Object.keys(splitSentenceGroups({ "a.xPre": "1", "a.xLink": "2" })), ["a.x"]);
  // A lone "Post"-suffixed key is not a split sentence.
  assert.deepEqual(Object.keys(splitSentenceGroups({ "b.yPost": "1" })), []);
});

// --- flat/nested round trip --------------------------------------------------

test("flatten and unflatten round-trip, preserving en.json's key order", () => {
  const nested = { nav: { events: "Events", about: "About" }, toc: { who: "Who" } };
  const flat = flatten(nested);
  assert.deepEqual(flat, { "nav.events": "Events", "nav.about": "About", "toc.who": "Who" });
  assert.deepEqual(unflatten(flat), nested);

  // Values arriving in a different order still write out in reference order, so
  // a re-translation diffs as changed values rather than a whole-file reshuffle.
  const shuffled = { "toc.who": "Ko", "nav.about": "O nama", "nav.events": "Događaji" };
  assert.deepEqual(Object.keys(unflatten(shuffled, flat)), ["nav", "toc"]);
  assert.deepEqual(Object.keys(unflatten(shuffled, flat).nav), ["events", "about"]);
});

// --- glossary integrity ------------------------------------------------------

test("every pinned term defines a canonical form for every Balkan target", () => {
  for (const [name, term] of Object.entries(TERMS)) {
    for (const code of ["hr", "bs", "sr"]) {
      assert.ok(term.canonical[code], `TERMS.${name} is missing a canonical form for ${code}`);
    }
  }
});

test("no pinned term forbids its own canonical form", () => {
  // A contradiction here would make every translation of that concept fail,
  // whatever the model returned.
  for (const [name, term] of Object.entries(TERMS)) {
    for (const [code, canonical] of Object.entries(term.canonical)) {
      for (const bad of term.forbidden) {
        assert.ok(
          !canonical.toLowerCase().includes(bad.toLowerCase()),
          `TERMS.${name}.canonical.${code} ("${canonical}") contains its own forbidden form "${bad}"`,
        );
      }
    }
  }
});

test("no protected name contains the glued-token pattern", () => {
  // The glue check runs on the raw string, which is only safe while no protected
  // name has a lowercase letter immediately followed by an uppercase one within
  // a word. If someone adds "iPhone" or "eBay" to PROTECTED, this test fails and
  // says so — rather than the glue check silently flagging every string that
  // mentions it. See the GLUED_RE comment in validate.mjs.
  for (const term of PROTECTED) {
    assert.ok(
      !/[\p{Ll}][\p{Lu}]/u.test(term),
      `PROTECTED contains "${term}", which trips the glued-token check — teach GLUED_RE about it first`,
    );
  }
});

test("the canonical terms themselves obey their language's variant rules", () => {
  // Catches the case where the glossary tells the model to write a Croatian word
  // in the Bosnian file, which the gate would then reject on every string.
  for (const [name, term] of Object.entries(TERMS)) {
    for (const code of ["hr", "bs", "sr"]) {
      const found = errorsOf(checkString(term.en, term.canonical[code], `glossary.${name}`, code));
      const variant = found.filter((f) => /wrong variant/.test(f.message));
      assert.deepEqual(variant, [], `TERMS.${name}.canonical.${code}: ${messages(variant)}`);
    }
  }
});
