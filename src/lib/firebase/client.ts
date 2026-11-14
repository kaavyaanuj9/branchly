import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

// Firebase web SDK (browser only). Sign-in state lives in the server's session
// cookie; FirebaseProvider signs this SDK in to match it so Firestore works.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getClientApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let auth: Auth | null = null;
export function getClientAuth(): Auth {
  if (auth) return auth;
  try {
    // Keep each tab's sign-in to itself. With shared (IndexedDB) persistence,
    // signing in as someone else in one tab would silently switch every tab.
    auth = initializeAuth(getClientApp(), {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    auth = getAuth(getClientApp()); // already initialized (e.g. after hot reload)
  }
  return auth;
}

let db: Firestore | null = null;
export function getDb(): Firestore {
  if (db) return db;
  try {
    // Optional TreeNode fields are often `undefined`; skip them instead of throwing.
    db = initializeFirestore(getClientApp(), { ignoreUndefinedProperties: true });
  } catch {
    db = getFirestore(getClientApp()); // already initialized (e.g. after hot reload)
  }
  return db;
}
