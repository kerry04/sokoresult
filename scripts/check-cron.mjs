// Check pg_cron jobs + recent runs through Supabase Management API.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const REF = env.SUPABASE_PROJECT_ID || env.VITE_SUPABASE_PROJECT_ID;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";

console.log("project ref:", REF, "| token:", TOKEN ? "present" : "MISSING");
if (!TOKEN) {
  console.log("Pass SUPABASE_ACCESS_TOKEN env var (never hardcode it).");
  process.exit(1);
}

const H = { Authorization: `Bearer ${TOKEN}` };

for (const path of [
  `/v1/projects/${REF}/config/database`,
]) {
  try {
    const r = await fetch(`https://api.supabase.com${path}`, { headers: H });
    console.log(path, "→", r.status);
  } catch (e) {
    console.log(path, "→ error", e.message);
  }
}

// pg_cron isn't exposed by the Management API; use the PostgREST route over
// the public API as a fallback signal — count raw_news_data rows instead.
const R = await fetch(`${env.SUPABASE_URL}/rest/v1/raw_news_data?select=id,source,published_at,processed&order=created_at.desc&limit=8`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});
const rows = await R.json();
console.log("\n=== latest raw_news_data rows ===");
for (const row of Array.isArray(rows) ? rows : [])
  console.log(`  ${row.source.padEnd(24)} processed=${row.processed}  ${row.published_at}`);
