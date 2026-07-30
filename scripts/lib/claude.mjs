// Claude plumbing for the two translation scripts.
//
// This replaced DeepL. The reason is not vendor preference — it is that DeepL's
// API takes one string at a time with no way to say "these forty strings appear
// on the same page, decide the terminology once". Every defect class that
// shipped traces back to that: a submit button's in-flight label "Sending…"
// returned as the imperative "Send", a link fragment that could not agree with
// the preposition in the fragment before it, and one buddy system with four
// names per language.
//
// So the shape of this module is the fix: ONE REQUEST PER LANGUAGE, carrying the
// whole set of strings. The model sees the button label next to the button text,
// and the three fragments of a split sentence next to each other.
//
// NOT PART OF THE BUILD. `npm run build` never calls this: the build stays
// hermetic — no network, no secrets — which is load-bearing in CLAUDE.md. You
// run it by hand (or the translate-content workflow does), review the diff, and
// commit the JSON. The SDK is a devDependency for the same reason.

import Anthropic from "@anthropic-ai/sdk";
import { languagePrompt, systemPrompt } from "./glossary.mjs";

const MODEL = "claude-opus-5";

// Generous, and streaming makes it safe. A whole dictionary is a large output;
// a non-streaming request that big risks an SDK HTTP timeout rather than a
// clean error.
const MAX_TOKENS = 64000;

/**
 * The response shape.
 *
 * An ARRAY of {key, value} pairs, not an object keyed by the dotted paths.
 * Structured outputs require `additionalProperties: false`, so an object with
 * dynamic keys is not expressible — a map would either need all 178 keys
 * enumerated in the schema or no schema at all.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translations"],
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value"],
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
      },
    },
  },
};

export function requireApiKey(scriptName = "translate") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is not set.\n" +
        "Locally: copy .env.example to .env and paste your key (get one at\n" +
        `https://console.anthropic.com/settings/keys), then run:  npm run ${scriptName}\n` +
        "In CI: add ANTHROPIC_API_KEY to the repository's Actions secrets.\n" +
        "The site build never needs this and stays hermetic.",
    );
    process.exit(1);
  }
  return apiKey;
}

/**
 * Render the strings for the prompt.
 *
 * Split sentences are presented as a GROUP with the joined English sentence
 * spelled out, because that is the single piece of context whose absence broke
 * all four sets: a fragment translated alone cannot know what precedes it.
 */
function renderItems(items, groups) {
  const grouped = new Set();
  for (const parts of Object.values(groups)) {
    for (const key of Object.values(parts)) grouped.add(key);
  }

  const lines = [];
  for (const parts of Object.values(groups)) {
    const joined = ["Pre", "Link", "Post"]
      .map((p) => (parts[p] ? (items.find((i) => i.key === parts[p])?.source ?? "") : ""))
      .join("");
    lines.push(`# One sentence split around a link. Joined, it reads:`);
    lines.push(`#   "${joined}"`);
    lines.push(`# Translate it as a whole sentence, then split it so these three concatenate back.`);
    for (const part of ["Pre", "Link", "Post"]) {
      if (!parts[part]) continue;
      const item = items.find((i) => i.key === parts[part]);
      lines.push(`${parts[part]}: ${JSON.stringify(item?.source ?? "")}`);
    }
    lines.push("");
  }

  for (const item of items) {
    if (grouped.has(item.key)) continue;
    const note = item.note ? `   # ${item.note}` : "";
    lines.push(`${item.key}: ${JSON.stringify(item.source)}${note}`);
  }
  return lines.join("\n");
}

/**
 * Translate one complete set of strings into one language.
 *
 * @param {object}   options
 * @param {{key: string, source: string, note?: string}[]} options.items
 * @param {string}   options.code    target language code
 * @param {string}   options.apiKey
 * @param {Record<string, Record<string,string>>} [options.groups] split-sentence groups
 * @returns {Promise<{ values: Record<string,string>, usage: object }>}
 */
export async function translateSet({ items, code, apiKey, groups = {} }) {
  const client = new Anthropic({ apiKey });

  const userMessage = [
    languagePrompt(code),
    "",
    "Translate every one of the following strings. The key is on the left; the JSON-quoted English value is on the right.",
    "Lines beginning with # are context for you, not strings to translate.",
    "",
    renderItems(items, groups),
    "",
    `Return all ${items.length} keys, with the translated value for each.`,
  ].join("\n");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Thinking is on by default on this model; set explicitly so the intent is
    // visible in the code rather than inherited from a default.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
    // The glossary and style guide are identical for every target language in a
    // run, so this prefix is written once and read for each language after.
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const message = await stream.finalMessage();

  // Check stop_reason BEFORE reading content. A refusal returns HTTP 200 with an
  // empty or partial content array, so indexing content[0] blindly is a crash
  // waiting for the wrong input.
  if (message.stop_reason === "refusal") {
    throw new Error(
      `Claude declined the request for ${code} (${message.stop_details?.category ?? "no category"}). Nothing was written.`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      `The response for ${code} hit max_tokens (${MAX_TOKENS}) and is truncated, so it was discarded rather than written. ` +
        `Split the run with an explicit language list, or raise MAX_TOKENS in scripts/lib/claude.mjs.`,
    );
  }

  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`No text block in the response for ${code}.`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // Should be unreachable: output_config.format constrains the response to the
    // schema. Kept because "unreachable" and "cannot happen" are different.
    throw new Error(`Could not parse the response for ${code} as JSON: ${error.message}`);
  }

  const values = {};
  for (const { key, value } of parsed.translations ?? []) values[key] = value;

  return { values, usage: message.usage };
}

/**
 * Translate a set, then ask again for anything that came back missing.
 *
 * A dropped key is the most invisible defect available here: the page still
 * renders, silently in English, and nothing fails. One retry for just the gap is
 * cheaper and more reliable than re-running the whole set.
 */
export async function translateSetComplete({ items, code, apiKey, groups = {} }) {
  const { values, usage } = await translateSet({ items, code, apiKey, groups });

  const missing = items.filter((i) => typeof values[i.key] !== "string" || values[i.key].trim() === "");
  if (missing.length === 0) return { values, usage };

  console.warn(`  ${code}: ${missing.length} key(s) came back missing — asking again for those`);
  const retry = await translateSet({ items: missing, code, apiKey, groups: {} });
  return { values: { ...values, ...retry.values }, usage };
}

/**
 * Which language did the board actually write this entry in?
 *
 * DeepL returned `detected_source_language` for free on every call, so the old
 * pipeline got this as a side effect. Here it is an explicit question — which is
 * an improvement in one respect: it is asked once per entry that changed, rather
 * than being inferred from whichever string happened to be translated first.
 *
 * Falls back to "en" rather than throwing: a wrong guess costs one redundant
 * translation, while an exception would block the board's save from being
 * localized at all.
 */
export async function detectSourceLang(texts, { apiKey, allowed }) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      // No deep reasoning needed to name a language, and this runs on every
      // board save — `low` keeps it quick and cheap.
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["language"],
          properties: { language: { type: "string", enum: allowed } },
        },
      },
    },
    messages: [
      {
        role: "user",
        content:
          `Which of these languages is the following text written in? Answer with one code: ${allowed.join(", ")}.\n\n` +
          texts.filter(Boolean).join("\n\n"),
      },
    ],
  });

  if (message.stop_reason === "refusal") return "en";
  const text = message.content.find((b) => b.type === "text")?.text;
  try {
    const { language } = JSON.parse(text ?? "{}");
    return allowed.includes(language) ? language : "en";
  } catch {
    return "en";
  }
}

/** Cost-visible summary, so a run says what it spent. */
export function formatUsage(usage) {
  if (!usage) return "";
  const parts = [`in ${usage.input_tokens ?? 0}`, `out ${usage.output_tokens ?? 0}`];
  if (usage.cache_read_input_tokens) parts.push(`cache read ${usage.cache_read_input_tokens}`);
  if (usage.cache_creation_input_tokens) parts.push(`cache write ${usage.cache_creation_input_tokens}`);
  return `(${parts.join(", ")})`;
}
