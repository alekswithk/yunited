// The three emails the buddy system sends, in the recipient's language, plus a
// thin Resend client.
//
// Isomorphic: `fetch` and template strings only, so it runs in the Worker
// (workerd) and under `npm test` in Node. A send failure must never break a
// signup or a matching round — `sendEmail` returns a status object, it never
// throws.
//
// Copy is kept here rather than pulled from src/i18n/*.json: the phrasing is
// email-specific, and a self-contained table is easier to review than a diff
// against the page dictionaries. English is the fallback for any missing string.

const FALLBACK = "en";

// One entry per locale. `sub` = subject, the rest are body fragments. {name},
// {partner}, {partnerRole} are filled per send.
const L = {
  en: {
    hi: (n) => `Hi ${n},`,
    verifySub: "Confirm your email to join the buddy pool",
    verifyBody:
      "You asked to be part of the YUnited buddy system. Confirm this is your address and you're in for the next matching round:",
    verifyBtn: "Confirm my email",
    verifyFoot: "Didn't sign up? Ignore this — nothing happens without the click.",
    matchedSub: (p) => `You've been matched — meet ${p}`,
    matchedBodyBuddy: (p) =>
      `You signed up to be a buddy, and your match this round is ${p}. They're new here and would like someone to ask.`,
    matchedBodySeeker: (p, r) =>
      `Your buddy for this round is ${p}${r ? ` (${r})` : ""}.`,
    matchedOpen: "Your pair page has their contact details and a few things to do first:",
    matchedBtn: "Open our pair page",
    matchedFoot: "Say hi within a week or so if you can. Not a good fit? There's a button on that page to tell us.",
    noMatchSub: "No match this round — you're held for the next one",
    noMatchBody:
      "We had more people looking for a buddy than buddies available this round, so we couldn't pair you yet. You stay in the pool and you're first in line next round.",
    unsub: "Leave the buddy pool",
    signoff: "— YUnited",
  },
  de: {
    hi: (n) => `Hallo ${n},`,
    verifySub: "Bestätige deine E-Mail für den Buddy-Pool",
    verifyBody:
      "Du möchtest beim YUnited-Buddy-System mitmachen. Bestätige, dass das deine Adresse ist, und du bist bei der nächsten Matching-Runde dabei:",
    verifyBtn: "E-Mail bestätigen",
    verifyFoot: "Nicht angemeldet? Ignoriere diese Nachricht — ohne den Klick passiert nichts.",
    matchedSub: (p) => `Du wurdest zugeteilt — das ist ${p}`,
    matchedBodyBuddy: (p) =>
      `Du hast dich als Buddy angemeldet, und dein Match in dieser Runde ist ${p}. Die Person ist neu hier und hätte gern jemanden zum Fragen.`,
    matchedBodySeeker: (p, r) => `Dein Buddy für diese Runde ist ${p}${r ? ` (${r})` : ""}.`,
    matchedOpen: "Auf eurer Paarseite stehen die Kontaktdaten und ein paar erste Schritte:",
    matchedBtn: "Zur Paarseite",
    matchedFoot: "Meldet euch möglichst innerhalb einer Woche. Passt nicht? Auf der Seite gibt es einen Button, um uns Bescheid zu geben.",
    noMatchSub: "Diese Runde keine Zuteilung — du bist für die nächste vorgemerkt",
    noMatchBody:
      "Diese Runde gab es mehr Suchende als Buddys, also konnten wir dich noch nicht zuteilen. Du bleibst im Pool und bist in der nächsten Runde als Erste:r dran.",
    unsub: "Buddy-Pool verlassen",
    signoff: "— YUnited",
  },
  hr: {
    hi: (n) => `Bok ${n},`,
    verifySub: "Potvrdi e-mail za skupinu kumstva",
    verifyBody:
      "Želiš sudjelovati u kumstvu kluba YUnited. Potvrdi da je ovo tvoja adresa i u sljedećoj si rundi uparivanja:",
    verifyBtn: "Potvrdi e-mail",
    verifyFoot: "Nisi se prijavio? Zanemari ovu poruku — bez klika se ništa ne događa.",
    matchedSub: (p) => `Upario si se — ovo je ${p}`,
    matchedBodyBuddy: (p) =>
      `Prijavio si se kao kum, a tvoj par ove runde je ${p}. Nov je ovdje i želi nekoga koga može pitati.`,
    matchedBodySeeker: (p, r) => `Tvoj kum za ovu rundu je ${p}${r ? ` (${r})` : ""}.`,
    matchedOpen: "Na stranici para su kontaktni podaci i nekoliko prvih koraka:",
    matchedBtn: "Otvori stranicu para",
    matchedFoot: "Javite se u tjedan dana ako možete. Ne odgovara? Na toj stranici je gumb da nam javiš.",
    noMatchSub: "Ova runda bez para — čekaš sljedeću",
    noMatchBody:
      "Ove runde bilo je više ljudi koji traže kuma nego dostupnih kumova, pa te još nismo uparili. Ostaješ u skupini i prvi si na redu u sljedećoj rundi.",
    unsub: "Izađi iz skupine kumstva",
    signoff: "— YUnited",
  },
  bs: {
    hi: (n) => `Zdravo ${n},`,
    verifySub: "Potvrdi e-mail za grupu kumstva",
    verifyBody:
      "Želiš učestvovati u kumstvu kluba YUnited. Potvrdi da je ovo tvoja adresa i u sljedećoj si rundi uparivanja:",
    verifyBtn: "Potvrdi e-mail",
    verifyFoot: "Nisi se prijavio? Zanemari ovu poruku — bez klika se ništa ne dešava.",
    matchedSub: (p) => `Uparen si — ovo je ${p}`,
    matchedBodyBuddy: (p) =>
      `Prijavio si se kao kum, a tvoj par ove runde je ${p}. Nov je ovdje i želi nekoga koga može pitati.`,
    matchedBodySeeker: (p, r) => `Tvoj kum za ovu rundu je ${p}${r ? ` (${r})` : ""}.`,
    matchedOpen: "Na stranici para su kontakt podaci i nekoliko prvih koraka:",
    matchedBtn: "Otvori stranicu para",
    matchedFoot: "Javite se u sedmicu dana ako možete. Ne odgovara? Na toj stranici je dugme da nam javiš.",
    noMatchSub: "Ova runda bez para — čekaš sljedeću",
    noMatchBody:
      "Ove runde bilo je više ljudi koji traže kuma nego dostupnih kumova, pa te još nismo uparili. Ostaješ u grupi i prvi si na redu u sljedećoj rundi.",
    unsub: "Izađi iz grupe kumstva",
    signoff: "— YUnited",
  },
  sr: {
    hi: (n) => `Zdravo ${n},`,
    verifySub: "Potvrdi e-mail za grupu kumstva",
    verifyBody:
      "Želiš da učestvuješ u kumstvu kluba YUnited. Potvrdi da je ovo tvoja adresa i u sledećoj si rundi uparivanja:",
    verifyBtn: "Potvrdi e-mail",
    verifyFoot: "Nisi se prijavio? Zanemari ovu poruku — bez klika se ništa ne dešava.",
    matchedSub: (p) => `Uparen si — ovo je ${p}`,
    matchedBodyBuddy: (p) =>
      `Prijavio si se kao kum, a tvoj par ove runde je ${p}. Nov je ovde i želi nekoga koga može da pita.`,
    matchedBodySeeker: (p, r) => `Tvoj kum za ovu rundu je ${p}${r ? ` (${r})` : ""}.`,
    matchedOpen: "Na stranici para su kontakt podaci i nekoliko prvih koraka:",
    matchedBtn: "Otvori stranicu para",
    matchedFoot: "Javite se u nedelju dana ako možete. Ne odgovara? Na toj stranici je dugme da nam javiš.",
    noMatchSub: "Ova runda bez para — čekaš sledeću",
    noMatchBody:
      "Ove runde bilo je više ljudi koji traže kuma nego dostupnih kumova, pa te još nismo uparili. Ostaješ u grupi i prvi si na redu u sledećoj rundi.",
    unsub: "Izađi iz grupe kumstva",
    signoff: "— YUnited",
  },
};

const dict = (locale) => L[locale] || L[FALLBACK];

/** Wrap plain paragraphs + one link button in the smallest sensible HTML. */
function htmlBody(paragraphs, link) {
  const ps = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const button = link
    ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)} &rarr;</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1a1611">\n${ps}\n${button}\n</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * @param {"verify"|"matched"|"noMatch"} kind
 * @param {string} locale
 * @param {object} vars
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildEmail(kind, locale, vars = {}) {
  const t = dict(locale);
  const name = vars.name || "";
  const unsub = vars.manageUrl ? `${t.unsub}: ${vars.manageUrl}` : "";

  if (kind === "verify") {
    const paras = [t.hi(name), t.verifyBody];
    const link = { href: vars.verifyUrl, label: t.verifyBtn };
    const foot = [t.verifyFoot, unsub].filter(Boolean).join("\n");
    return {
      subject: t.verifySub,
      text: [...paras, `${t.verifyBtn}: ${vars.verifyUrl}`, "", foot, t.signoff].join("\n\n"),
      html: htmlBody([...paras, foot, t.signoff], link),
    };
  }

  if (kind === "matched") {
    const isBuddy = vars.youAre === "buddy";
    const partnerLine = isBuddy
      ? t.matchedBodyBuddy(vars.partner)
      : t.matchedBodySeeker(vars.partner, vars.partnerRole || "");
    const paras = [t.hi(name), partnerLine, t.matchedOpen];
    const link = { href: vars.pairUrl, label: t.matchedBtn };
    const foot = [t.matchedFoot, unsub].filter(Boolean).join("\n");
    return {
      subject: t.matchedSub(vars.partner),
      text: [...paras, `${t.matchedBtn}: ${vars.pairUrl}`, "", foot, t.signoff].join("\n\n"),
      html: htmlBody([...paras, foot, t.signoff], link),
    };
  }

  // noMatch
  const paras = [t.hi(name), t.noMatchBody];
  const foot = unsub || "";
  return {
    subject: t.noMatchSub,
    text: [...paras, foot, t.signoff].filter(Boolean).join("\n\n"),
    html: htmlBody([...paras, foot, t.signoff].filter(Boolean), null),
  };
}

/**
 * Send one email through Resend. Never throws.
 *
 * @returns {Promise<{ ok: true, id?: string } | { ok: false, skipped?: boolean, reason?: string, status?: number, detail?: string }>}
 */
export async function sendEmail(env, { to, subject, text, html }, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, reason: "no-key" };

  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.BUDDY_EMAIL_FROM || "YUnited Buddy <buddy@yunited.ch>",
        to: [to],
        reply_to: env.BUDDY_EMAIL_REPLYTO || "yunited@shsg.ch",
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail: detail.slice(0, 300) };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: body.id };
  } catch (error) {
    return { ok: false, reason: "network", detail: String(error?.message ?? error) };
  }
}
