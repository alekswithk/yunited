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
//
// `renderHtml` is a single hand-written, inline-styled, table-based HTML
// template — the shape every serious client (Outlook included) still needs.
// No web fonts load in mail, so the wordmark is a system serif and the body a
// system sans. The reading order is fixed: masthead → greeting → context →
// the one call-to-action button → sign-off → a hairline → fine print, with the
// "leave the pool" link always last, in muted footer type. Keep it that way.

const FALLBACK = "en";

// One entry per locale. `sub` = subject, the rest are body fragments. {name},
// {partner}, {partnerRole} are filled per send.
const L = {
  en: {
    hi: (n) => `Hi ${n},`,
    kicker: "Buddy programme",
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
    kicker: "Buddy-Programm",
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
    kicker: "Kumstvo",
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
    kicker: "Kumstvo",
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
    kicker: "Kumstvo",
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// --- one shared visual language for all three mails -------------------------
// System stacks only (mail clients don't load web fonts); brand palette from
// src/styles/global.css. Square corners, a hairline card, one gold-shadowed
// button — the site's editorial look, trimmed to what mail can render.
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = "#1a1611";
const PAPER = "#f4ecdd";
const SHELL = "#efe6d6";
const CARD = "#ffffff";
const HAIRLINE = "#e2d7c0";
const MUTED = "#6a5f4e";
const RED = "#b3202c";
const GOLD = "#e9b44c";

/**
 * The full HTML mail. One centred card: masthead, body copy, the single call
 * to action, sign-off, then a muted footer holding the fine print and — last —
 * the unsubscribe link.
 *
 * @param {{ lang: string, subject: string, preheader: string, kicker: string,
 *   paragraphs: string[], cta: {href:string,label:string}|null, signoff: string,
 *   fine: string[], unsub: {href:string,label:string}|null }} parts
 */
function renderHtml(parts) {
  const { lang, subject, preheader, kicker, paragraphs, cta, signoff, fine, unsub } = parts;
  const e = escapeHtml;

  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;">${e(p)}</p>`)
    .join("\n          ");

  const ctaRow = cta
    ? `
        <tr>
          <td style="padding:8px 40px 6px;">
            <a href="${e(cta.href)}" style="display:inline-block;background:${INK};color:${PAPER};font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:.02em;line-height:1;text-decoration:none;padding:14px 30px;border:2px solid ${INK};box-shadow:4px 4px 0 ${GOLD};">${e(cta.label)}</a>
          </td>
        </tr>`
    : "";

  const footerBits = [
    ...fine.map((p) => `<p style="margin:0 0 12px;">${e(p)}</p>`),
    unsub
      ? `<p style="margin:0 0 12px;"><a href="${e(unsub.href)}" style="color:${MUTED};text-decoration:underline;">${e(unsub.label)}</a></p>`
      : "",
    `<p style="margin:0;">YUnited &middot; Balkan &amp; ex-Yugoslav student club at the University of St.&nbsp;Gallen</p>`,
  ]
    .filter(Boolean)
    .join("\n          ");

  return `<!doctype html>
<html lang="${e(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SHELL};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SHELL};">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${CARD};border:1px solid ${HAIRLINE};">
          <tr>
            <td style="padding:30px 40px 0;">
              <div style="font-family:${SERIF};font-size:21px;font-weight:700;letter-spacing:.02em;color:${INK};">YUnited</div>
              <div style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${RED};padding-top:6px;">${e(kicker)}</div>
              <div style="border-top:2px solid ${INK};font-size:0;line-height:0;margin-top:14px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 6px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">
          ${body}
            </td>
          </tr>${ctaRow}
          <tr>
            <td style="padding:14px 40px 30px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">
              <p style="margin:0;">${e(signoff)}</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
          <tr>
            <td style="padding:18px 40px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
          ${footerBits}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The plain-text alternative, same reading order as the HTML. */
function renderText({ paragraphs, cta, signoff, fine, unsubLine }) {
  const lines = [...paragraphs];
  if (cta) lines.push(`${cta.label}: ${cta.href}`);
  lines.push(signoff);
  const tail = [...fine];
  if (unsubLine) tail.push(unsubLine);
  const blocks = [lines.join("\n\n")];
  if (tail.length) blocks.push(tail.join("\n"));
  return blocks.join("\n\n---\n\n");
}

/**
 * @param {"verify"|"matched"|"noMatch"} kind
 * @param {string} locale
 * @param {object} vars
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildEmail(kind, locale, vars = {}) {
  const t = dict(locale);
  const lang = L[locale] ? locale : FALLBACK;
  const name = vars.name || "";
  const unsub = vars.manageUrl ? { href: vars.manageUrl, label: t.unsub } : null;
  const unsubLine = vars.manageUrl ? `${t.unsub}: ${vars.manageUrl}` : "";

  const compose = ({ subject, preheader, paragraphs, cta, fine }) => ({
    subject,
    text: renderText({ paragraphs, cta, signoff: t.signoff, fine, unsubLine }),
    html: renderHtml({
      lang,
      subject,
      preheader,
      kicker: t.kicker,
      paragraphs,
      cta,
      signoff: t.signoff,
      fine,
      unsub,
    }),
  });

  if (kind === "verify") {
    return compose({
      subject: t.verifySub,
      preheader: t.verifyBody,
      paragraphs: [t.hi(name), t.verifyBody],
      cta: { href: vars.verifyUrl, label: t.verifyBtn },
      fine: [t.verifyFoot],
    });
  }

  if (kind === "matched") {
    const partnerLine =
      vars.youAre === "buddy"
        ? t.matchedBodyBuddy(vars.partner)
        : t.matchedBodySeeker(vars.partner, vars.partnerRole || "");
    return compose({
      subject: t.matchedSub(vars.partner),
      preheader: partnerLine,
      paragraphs: [t.hi(name), partnerLine, t.matchedOpen],
      cta: { href: vars.pairUrl, label: t.matchedBtn },
      fine: [t.matchedFoot],
    });
  }

  // noMatch — no call to action
  return compose({
    subject: t.noMatchSub,
    preheader: t.noMatchBody,
    paragraphs: [t.hi(name), t.noMatchBody],
    cta: null,
    fine: [],
  });
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
