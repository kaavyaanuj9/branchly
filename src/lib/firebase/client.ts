import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase web SDK, used in the browser only to run the Google sign-in popup.
// The login itself lives in an httpOnly session cookie set by the server.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getClientAuth() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}
