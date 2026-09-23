// Debug: inspect Firebase test token claims + retry the exchange.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const FIREBASE_KEY = env.VITE_FIREBASE_API_KEY;
const SUPABASE_URL = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = `soko-dbg3-${Date.now()}@sokoresult-test.com`;

const su = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Referer: "https://sokoresult.vercel.app/" },
  body: JSON.stringify({ email, password: "e2e-Test-Passw0rd!", returnSecureToken: true }),
}).then((r) => r.json());

const claims = JSON.parse(Buffer.from(su.idToken.split(".")[1], "base64").toString());
console.log("token claims: aud =", claims.aud, "| iss =", claims.iss);
console.log("SUPABASE_URL host:", new URL(SUPABASE_URL).host);
console.log("apikey prefix:", SUPABASE_KEY.slice(0, 12));

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, "x-client-info": "supabase-js/2.104.0", "User-Agent": "node-fetch/1.0 (+https://supabase.com)", Authorization: `Bearer ${SUPABASE_KEY}` },
  body: JSON.stringify({ provider: "firebase", id_token: su.idToken }),
});
console.log("exchange status:", res.status, JSON.stringify(await res.json()).slice(0, 200));

await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Referer: "https://sokoresult.vercel.app/" },
  body: JSON.stringify({ idToken: su.idToken }),
}).catch(() => {});
console.log("cleanup done");
