import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  type Auth,
  type UserCredential,
} from 'firebase/auth';

/**
 * Firebase auth bridge for Supabase third-party auth.
 *
 * Users authenticate with Firebase (email, Google, or Apple); the resulting
 * ID token is exchanged with Supabase via signInWithIdToken (see AuthForm),
 * which issues a normal Supabase session — so every RLS policy keyed off
 * auth.uid() keeps working unchanged.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;

function getApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID in your .env file.'
    );
  }
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(getApp());
  return _auth;
}

/** Sign in with Firebase email/password; resolves with the ID token for the Supabase exchange. */
export async function firebaseSignIn(email: string, password: string): Promise<string> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return cred.user.getIdToken();
}

/** Create a Firebase email/password account; resolves with the ID token for the Supabase exchange. */
export async function firebaseSignUp(email: string, password: string): Promise<string> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  return cred.user.getIdToken();
}

/** sessionStorage key holding the in-app destination for redirect-based OAuth returns. */
const OAUTH_REDIRECT_KEY = 'soko:oauth-redirect';

/** Persist where to send the user after a redirect-based OAuth flow returns. */
export function setOAuthRedirectTarget(to: string) {
  try {
    sessionStorage.setItem(OAUTH_REDIRECT_KEY, to);
  } catch {
    /* private mode etc. — popup flow will still work */
  }
}

/** Consume the stored redirect target (returns null if none was stored). */
export function consumeOAuthRedirectTarget(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_REDIRECT_KEY);
  } catch {
    return null;
  }
}

function credentialToIdToken(cred: UserCredential): Promise<string> {
  return cred.user.getIdToken();
}

/**
 * Sign in with Google through Firebase. Opens a popup first; if the popup is
 * blocked (common on mobile in-app browsers), falls back to a full-page
 * redirect — the caller must then complete the flow via
 * `completeRedirectSignIn()` on the next page load.
 */
export async function firebaseSignInWithGoogle(): Promise<string | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return runOAuth(getFirebaseAuth(), provider);
}

/**
 * Sign in with Apple through Firebase. Requires the Apple provider to be
 * enabled in the Firebase console (Authentication → Sign-in method) with a
 * Services ID + key from the Apple Developer portal.
 */
export async function firebaseSignInWithApple(): Promise<string | null> {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return runOAuth(getFirebaseAuth(), provider);
}

async function runOAuth(auth: Auth, provider: GoogleAuthProvider | OAuthProvider): Promise<string | null> {
  try {
    const cred = await signInWithPopup(auth, provider);
    return await credentialToIdToken(cred);
  } catch (err) {
    if (isPopupBlocked(err)) {
      // Popup blocked — fall back to a full-page redirect. The page will
      // reload after the provider round-trip; AuthShell completes the flow.
      await signInWithRedirect(auth, provider);
      return null; // control never returns here; page navigates away
    }
    throw err;
  }
}

function isPopupBlocked(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? '';
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/operation-not-supported-in-this-environment'
  );
}

/**
 * After a redirect-based OAuth flow returns to the app, exchange the Firebase
 * result for a fresh ID token. Resolves null when there is no pending result
 * (normal page load, popup flow, etc.).
 */
export async function completeRedirectSignIn(): Promise<string | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const result = await getRedirectResult(getFirebaseAuth());
    if (!result) return null;
    return await credentialToIdToken(result);
  } catch {
    // Redirect errors are surfaced by the normal sign-in path; don't double-toast.
    return null;
  }
}
