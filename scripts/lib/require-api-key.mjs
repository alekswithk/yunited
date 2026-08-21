// The one Node-only piece of the translation pipeline, kept out of
// src/lib/translate/ on purpose.
//
// Everything in src/lib/translate/ runs in TWO runtimes: Node (these scripts)
// and workerd (the /admin Worker, which translates a board member's save).
// `process.env` and `process.exit` exist in only one of them, and a Worker has
// no console to print an instruction to anyway — it resolves its key from KV or
// a Worker secret and degrades to "translations are off" in the panel.
//
// So the key lookup lives here, at the CLI edge, and deepl.js takes an apiKey
// argument like the pure function it is.

/**
 * The DeepL key for a command-line run, or a printed instruction and exit 1.
 *
 * @param {string} [scriptName] the npm script to name in the message
 * @returns {string}
 */
export function requireApiKey(scriptName = "translate") {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    console.error(
      "DEEPL_API_KEY is not set.\n" +
        "Locally: copy .env.example to .env and paste your key (get one at\n" +
        "https://www.deepl.com/pro-api — the free tier's 1,000,000 chars/month is\n" +
        `plenty here), then run:  npm run ${scriptName}\n` +
        "The site build never needs this and stays hermetic. The board's own\n" +
        "saves do not use this key at all — /admin resolves its own, see\n" +
        "worker/README.md.",
    );
    process.exit(1);
  }
  return apiKey;
}
