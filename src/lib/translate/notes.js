// Per-key context notes for DeepL.
//
// A key name and an English string are not always enough to disambiguate.
// `contact.formSending` is the case that proves it: "Sending…" is a status, not
// a command, and nothing in the string says so. DeepL's `context` parameter is
// per request, so each note travels with its one string.
//
// Shared by scripts/translate.mjs (the offline CLI) and worker/index.js (the
// inline copy editor's save). Isomorphic — plain data, no node:/fs/process — so
// the same note reaches DeepL whichever path runs. See CLAUDE.md.

export const NOTES = {
  "contact.formSending":
    "Status label shown ON the submit button while the request is in flight. A STATE, never an imperative — it must read differently from contact.formSend.",
  "contact.formSend": "The submit button's resting label. This one IS an imperative.",
  "events.dateTba":
    "A short badge on an event card whose date is not set yet. Keep it badge-length.",
  "toc.upcoming": "A table-of-contents section label, not a time adverb.",
  "toc.recent": "A table-of-contents section label for recent events.",
  "nav.members":
    "Nav label for the page listing club members AND the board. It is not the name of the governing body.",
  "footer.connect":
    "Footer column heading for social links. Must read differently from nav.contact.",
};
