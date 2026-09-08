// Non-blocking liveness check for external links visitors can click.
//
// Internal routes are deterministic and enforced by check-dist.mjs. External
// hosts are not: an RSVP or social URL can disappear while the repo remains
// perfectly valid. This script reports failures but deliberately exits zero so
// a transient third-party outage never blocks a deploy. CI runs it weekly.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = 10_000;

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? htmlFiles(full) : full.endsWith(".html") ? [full] : [];
  });
}

const links = new Set();
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, "utf8");
  for (const [, raw] of html.matchAll(/<a\b[^>]*\shref=["'](https?:\/\/[^"']+)["'][^>]*>/gi)) {
    const url = raw.replaceAll("&amp;", "&");
    if (new URL(url).hostname !== "yunited.ch") links.add(url);
  }
}

if (DRY_RUN) {
  console.log([...links].sort().join("\n"));
  process.exit(0);
}

async function probe(url) {
  const request = async (method) =>
    fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "YUnited-Link-Check/1.0 (+https://yunited.ch)",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
      },
    });

  try {
    let response = await request("HEAD");
    if (response.status === 403 || response.status === 405) response = await request("GET");
    return response.ok ? null : `${url} → HTTP ${response.status}`;
  } catch (error) {
    return `${url} → ${error?.name === "TimeoutError" ? "timed out" : String(error?.message ?? error)}`;
  }
}

const pending = [...links].sort();
const failures = [];
const workers = Array.from({ length: Math.min(4, pending.length) }, async () => {
  while (pending.length) {
    const url = pending.shift();
    const failure = await probe(url);
    if (failure) failures.push(failure);
  }
});
await Promise.all(workers);

if (failures.length) {
  console.warn(`⚠ External link check: ${failures.length} link${failures.length === 1 ? "" : "s"} need review`);
  for (const failure of failures) console.warn(`  ${failure}`);
  console.warn("  Informational only: third-party outages never block a deploy.");
} else {
  console.log(`✓ External link check: ${links.size} links responded`);
}
