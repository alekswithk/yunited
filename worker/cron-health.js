const PREFIX = "cron.health.";
export const CRON_JOBS = ["translation", "buddyRetention"];

const detailOf = (result) => {
  if (typeof result?.detail === "string" && result.detail.trim()) return result.detail.trim();
  return result?.ok === false ? "Failed without a detail message." : "Completed.";
};

/** Run one scheduled job and persist a small, secret-free health record. */
export async function trackCronJob(env, name, run, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  let result;
  try {
    result = await run();
  } catch (error) {
    result = { ok: false, detail: String(error?.message ?? error) };
  }

  const record = {
    ranAt: now(),
    ok: result?.ok !== false,
    detail: detailOf(result),
  };

  if (env.ADMIN_SETTINGS) {
    try {
      await env.ADMIN_SETTINGS.put(`${PREFIX}${name}`, JSON.stringify(record));
    } catch (error) {
      console.error(`[cron] could not record ${name} health:`, error);
    }
  }
  return record;
}

/** Read the latest records for the admin panel. */
export async function readCronHealth(env) {
  if (!env.ADMIN_SETTINGS) return { supported: false, jobs: {} };
  const rows = await Promise.all(
    CRON_JOBS.map(async (name) => [
      name,
      await env.ADMIN_SETTINGS.get(`${PREFIX}${name}`, { type: "json", cacheTtl: 60 }),
    ]),
  );
  return { supported: true, jobs: Object.fromEntries(rows) };
}
