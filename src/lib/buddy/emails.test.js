import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEmail, sendEmail } from "./emails.js";

test("verify email carries the name, the link and an unsubscribe", () => {
  const mail = buildEmail("verify", "en", {
    name: "Mara",
    verifyUrl: "https://yunited.ch/buddy/api/verify?token=abc",
    manageUrl: "https://yunited.ch/buddy/api/withdraw?token=xyz",
  });
  assert.match(mail.subject, /Confirm/);
  assert.match(mail.text, /Hi Mara,/);
  assert.match(mail.text, /verify\?token=abc/);
  assert.match(mail.text, /withdraw\?token=xyz/);
  assert.match(mail.html, /<a href="https:\/\/yunited\.ch\/buddy\/api\/verify\?token=abc"/);
});

test("matched email differs for the buddy and the seeker", () => {
  const toBuddy = buildEmail("matched", "en", {
    name: "Ivan",
    youAre: "buddy",
    partner: "Mara",
    pairUrl: "https://yunited.ch/buddy/pair?t=b1",
  });
  const toSeeker = buildEmail("matched", "en", {
    name: "Mara",
    youAre: "seeker",
    partner: "Ivan",
    partnerRole: "3rd-year Business",
    pairUrl: "https://yunited.ch/buddy/pair?t=s1",
  });
  assert.match(toBuddy.text, /signed up to be a buddy/);
  assert.match(toSeeker.text, /Your buddy for this round is Ivan \(3rd-year Business\)/);
  assert.match(toBuddy.subject, /meet Mara/);
});

test("localised subject and greeting for hr uses kumstvo wording", () => {
  const mail = buildEmail("verify", "hr", { name: "Luka", verifyUrl: "https://x/y" });
  assert.match(mail.subject, /kumstva/);
  assert.match(mail.text, /Bok Luka,/);
});

test("an unknown locale falls back to English", () => {
  const mail = buildEmail("noMatch", "it", { name: "Sara" });
  assert.match(mail.subject, /No match this round/);
});

test("html output escapes angle brackets in a name", () => {
  const mail = buildEmail("verify", "en", { name: "<script>", verifyUrl: "https://x/y" });
  assert.ok(!mail.html.includes("<script>"));
  assert.match(mail.html, /&lt;script&gt;/);
});

test("sendEmail is a no-op (not an error) when no key is configured", async () => {
  const result = await sendEmail({}, { to: "a@b.c", subject: "s", text: "t", html: "<p>t</p>" });
  assert.deepEqual(result, { ok: false, skipped: true, reason: "no-key" });
});

test("sendEmail posts to Resend with the bearer key and never throws on a bad response", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: false, status: 422, text: async () => '{"message":"domain not verified"}' };
  };
  const result = await sendEmail(
    { RESEND_API_KEY: "re_test_123", BUDDY_EMAIL_FROM: "YUnited <buddy@yunited.ch>" },
    { to: "mara@x.ch", subject: "s", text: "t", html: "<p>t</p>" },
    fakeFetch,
  );
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_123");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.from, "YUnited <buddy@yunited.ch>");
  assert.deepEqual(sent.to, ["mara@x.ch"]);
  assert.equal(sent.reply_to, "yunited@shsg.ch");
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
});

test("sendEmail returns ok with the id on success", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ id: "abc-123" }) });
  const result = await sendEmail({ RESEND_API_KEY: "re_x" }, { to: "x@y.z", subject: "s", text: "t", html: "h" }, fakeFetch);
  assert.deepEqual(result, { ok: true, id: "abc-123" });
});

test("sendEmail swallows a network throw", async () => {
  const fakeFetch = async () => {
    throw new Error("ECONNRESET");
  };
  const result = await sendEmail({ RESEND_API_KEY: "re_x" }, { to: "x@y.z", subject: "s", text: "t", html: "h" }, fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "network");
});
