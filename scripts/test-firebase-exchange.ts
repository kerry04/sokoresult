// End-to-end test: Firebase ID token -> Supabase session exchange.
// Run: node --experimental-strip-types --env-file=.env scripts/test-firebase-exchange.ts
//
// Exercises the exact server-side path behind signInWithIdToken:
//   1. Create a throwaway user in Firebase (identitytoolkit REST API)
//   2. Exchange its ID token with Supabase /auth/v1/token?grant_type=id_token
//   3. PASS = a Supabase access_token comes back
//   4. Delete the throwaway Firebase user

const FIREBASE_KEY = process.env.VITE_FIREBASE_API_KEY;
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!FIREBASE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_FIREBASE_API_KEY / VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(2);
}

const email = `soko-e2e-${Date.now()}@sokoresult-test.com`;
const password = "e2e-Test-Passw0rd!";

async function main() {
  // 1. Create throwaway Firebase user
  const signUpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signUp = await signUpRes.json();
  if (!signUp.idToken) {
    console.error("[FAIL] Could not create Firebase test user:", JSON.stringify(signUp).slice(0, 300));
    process.exit(1);
  }
  console.log(`[OK] Firebase test user created: ${email}`);

  try {
    // 2. Exchange with Supabase (the exact grant the Google button uses)
    const exRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ provider: "firebase", token: signUp.idToken }),
    });
    const ex = await exRes.json();

    if (exRes.ok && ex.access_token) {
      console.log("[OK] Supabase session issued!");
      console.log(`     user id:  ${ex.user?.id}`);
      console.log(`     email:    ${ex.user?.email}`);
      console.log(`     provider: ${ex.user?.app_metadata?.provider}`);
      console.log("\n✅ PASS — Firebase third-party auth is live. Google sign-in will work.");
      process.exit(0);
    } else {
      console.error("[FAIL] Supabase rejected the exchange:", JSON.stringify(ex).slice(0, 300));
      process.exit(1);
    }
  } finally {
    // 3. Cleanup throwaway Firebase user
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: signUp.idToken }),
    }).catch(() => {});
    console.log("[OK] Firebase test user deleted");
  }
}

main();
