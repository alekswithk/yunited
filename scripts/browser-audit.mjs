// Scheduled, non-blocking browser audit for the rendering gaps static checks
// cannot see: phone-width screenshots, serious accessibility violations, and
// a small set of navigation/paint metrics. Results are CI artifacts, not gates;
// visual baselines and hard performance budgets need real review history first.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import axe from "axe-core";
import { chromium } from "playwright-core";

const PORT = 4327;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = new URL("../artifacts/browser-audit/", import.meta.url).pathname;
const targets = [
  { name: "home-phone", path: "/", width: 390, height: 844 },
  { name: "events-desktop", path: "/events", width: 1440, height: 1000 },
  { name: "about-hr-phone", path: "/hr/about", width: 375, height: 812 },
  { name: "buddy-pair-hr-phone", path: "/hr/buddy/pair", width: 375, height: 812 },
  { name: "admin-phone", path: "/admin", width: 375, height: 812 },
];

const server = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(PORT)],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await delay(100);
  }
  throw new Error(`Astro preview did not start.\n${serverOutput}`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), pages: [] };

  for (const target of targets) {
    const page = await browser.newPage({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await page.addInitScript(() => {
      window.__yunitedAudit = { cls: 0, lcp: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__yunitedAudit.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__yunitedAudit.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    const response = await page.goto(`${ORIGIN}${target.path}`, { waitUntil: "networkidle" });
    await page.addScriptTag({ content: axe.source });
    const accessibility = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
      return result.violations
        .filter((violation) => ["serious", "critical"].includes(violation.impact))
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.map((node) => node.target),
        }));
    });
    const performance = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint");
      const fcp = paint.find((entry) => entry.name === "first-contentful-paint");
      return {
        fcpMs: Math.round(fcp?.startTime ?? 0),
        lcpMs: Math.round(window.__yunitedAudit?.lcp ?? 0),
        cls: Number((window.__yunitedAudit?.cls ?? 0).toFixed(4)),
        domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
        loadMs: Math.round(nav?.loadEventEnd ?? 0),
        transferredBytes: performance
          .getEntriesByType("resource")
          .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      };
    });

    await page.screenshot({ path: join(OUT, `${target.name}.png`), fullPage: true });
    report.pages.push({
      ...target,
      status: response?.status() ?? null,
      accessibility,
      performance,
    });
    await page.close();
  }

  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const violations = report.pages.reduce((sum, page) => sum + page.accessibility.length, 0);
  console.log(`✓ Browser audit: ${report.pages.length} pages captured in ${OUT}`);
  if (violations) {
    console.warn(`⚠ ${violations} serious/critical accessibility finding${violations === 1 ? "" : "s"}; see report.json`);
  } else {
    console.log("✓ No serious or critical axe findings");
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
