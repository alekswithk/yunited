import { test } from "node:test";
import assert from "node:assert/strict";

import { localizeEntry } from "./localize.js";

const event = {
  title: "Meet & Greet",
  description: "Welcome.",
  location: "St. Gallen",
  i18n: {
    hr: { title: "Upoznavanje", description: "" },
    bs: { title: "  ", description: "Dobro došli." },
  },
};

test("localizeEntry applies a partial translation field by field", () => {
  assert.deepEqual(localizeEntry(event, "hr"), {
    ...event,
    title: "Upoznavanje",
    description: "Welcome.",
  });
});

test("localizeEntry ignores blank translated fields", () => {
  assert.deepEqual(localizeEntry(event, "bs"), {
    ...event,
    title: "Meet & Greet",
    description: "Dobro došli.",
  });
});

test("localizeEntry returns the original object when the locale is absent", () => {
  assert.equal(localizeEntry(event, "de"), event);
  assert.equal(localizeEntry({ title: "Plain" }, "hr").title, "Plain");
});
