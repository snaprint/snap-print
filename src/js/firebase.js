/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Firebase Auth + Firestore helpers
   Shared module used by checkout (and future pages if needed).
   Config values come from VITE_FIREBASE_* env vars (set in
   Cloudflare Pages dashboard + local .env for dev).
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ── Firebase config from Vite env vars ──
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// ── Initialize ──
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Use local persistence so returning visitors stay logged in
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('[Firebase] Failed to set persistence:', err);
});

// ── Auth helpers ──

const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with Google popup.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Create a new account with email + password.
 * Sends a verification email automatically after signup.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signUpWithEmail(email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  // Fire-and-forget verification email — don't block signup
  sendEmailVerification(credential.user).catch(err => {
    console.warn('[Firebase] Verification email failed:', err);
  });
  return credential;
}

/**
 * Sign in with existing email + password.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Send a password-reset email.
 */
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Sign out the current user.
 */
export async function signOutUser() {
  return signOut(auth);
}

/**
 * Listen for auth state changes.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the currently signed-in user (or null).
 * @returns {import('firebase/auth').User | null}
 */
export function getCurrentUser() {
  return auth.currentUser;
}

// ── Firestore helpers (buyers collection) ──

const BUYERS_COLLECTION = 'buyers';

/**
 * Fetch the buyer profile for a given uid.
 * @param {string} uid
 * @returns {Promise<object|null>} profile data or null if not found
 */
export async function getBuyerProfile(uid) {
  try {
    const snap = await getDoc(doc(db, BUYERS_COLLECTION, uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('[Firebase] Failed to read buyer profile:', err);
    return null;
  }
}

/**
 * Save or update the buyer profile for a given uid.
 * Uses merge so partial updates don't wipe other fields.
 * @param {string} uid
 * @param {object} data — fields to save (name, phone, address, etc.)
 */
export async function saveBuyerProfile(uid, data) {
  try {
    await setDoc(doc(db, BUYERS_COLLECTION, uid), {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('[Firebase] Failed to save buyer profile:', err);
  }
}

export { auth, db };
