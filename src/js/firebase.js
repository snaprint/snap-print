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
  collection,
  getDocs,
  query,
  orderBy,
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
  return onAuthStateChanged(auth, (user) => {
    // Set a lightweight flag for non-Firebase pages (e.g. main.js navbar redirect)
    try {
      if (user) {
        localStorage.setItem('snaprint_logged_in', '1');
      } else {
        localStorage.removeItem('snaprint_logged_in');
      }
    } catch { /* localStorage may be unavailable */ }
    callback(user);
  });
}

/**
 * Get the currently signed-in user (or null).
 * @returns {import('firebase/auth').User | null}
 */
export function getCurrentUser() {
  return auth.currentUser;
}

// ── Firestore helpers (buyers collection) ──
//
// F-4: every helper lets Firestore errors propagate (they used to be
// swallowed, so the UI said "saved" when nothing was saved). Callers must
// catch and tell the user. Reads throw too: the address helpers do a
// read-modify-write of the whole array, so treating a failed read as "no
// addresses" would overwrite the buyer's saved addresses.

const BUYERS_COLLECTION = 'buyers';
const MAX_ADDRESSES = 16;

/**
 * Fetch the buyer profile for a given uid.
 * Auto-migrates flat address fields → addresses[] array on read.
 * @param {string} uid
 * @returns {Promise<object|null>} profile data, or null if there is no profile yet
 * @throws if Firestore can't be read
 */
export async function getBuyerProfile(uid) {
  const snap = await getDoc(doc(db, BUYERS_COLLECTION, uid));
  if (!snap.exists()) return null;
  const data = snap.data();

  // Auto-migrate: if flat address fields exist but no addresses array
  if (!data.addresses && data.address) {
    const migrated = migrateFlatProfile(data);
    // Best-effort save of migrated data; the next read migrates again if it fails.
    setDoc(doc(db, BUYERS_COLLECTION, uid), migrated, { merge: true })
      .catch(err => console.warn('[Firebase] Migration save failed:', err));
    return { ...data, ...migrated };
  }

  return data;
}

/**
 * Migrate a flat profile (old format) to the new addresses[] format.
 */
function migrateFlatProfile(data) {
  const addr = {
    id: generateAddressId(),
    label: 'Home',
    name: data.name || '',
    phone: data.phone || '',
    address: data.address || '',
    apartment: data.apartment || '',
    city: data.city || '',
    state: data.state || '',
    pincode: data.pincode || '',
    isDefault: true,
  };
  return { addresses: [addr] };
}

/**
 * Save or update the buyer profile for a given uid.
 * Uses merge so partial updates don't wipe other fields.
 * @throws if the write fails
 */
export async function saveBuyerProfile(uid, data) {
  await setDoc(doc(db, BUYERS_COLLECTION, uid), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function writeAddresses(uid, addresses) {
  await setDoc(doc(db, BUYERS_COLLECTION, uid), {
    addresses,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── Address CRUD helpers ──

/**
 * Add a new address to the buyer's addresses array. Max 16.
 * @returns {Promise<string|null>} the new address id, or null if the limit is reached
 * @throws if Firestore can't be read or written
 */
export async function addBuyerAddress(uid, addressData) {
  const profile = await getBuyerProfile(uid);
  const addresses = profile?.addresses || [];
  if (addresses.length >= MAX_ADDRESSES) return null;

  const newAddr = {
    id: generateAddressId(),
    ...addressData,
    isDefault: addresses.length === 0, // first address is default
  };
  addresses.push(newAddr);
  await writeAddresses(uid, addresses);
  return newAddr.id;
}

/**
 * Update an existing address by its id.
 * @throws if the address no longer exists or Firestore fails
 */
export async function updateBuyerAddress(uid, addressId, addressData) {
  const profile = await getBuyerProfile(uid);
  const addresses = profile?.addresses || [];
  const idx = addresses.findIndex(a => a.id === addressId);
  if (idx === -1) throw new Error('This address no longer exists. Please refresh the page.');

  addresses[idx] = { ...addresses[idx], ...addressData };
  await writeAddresses(uid, addresses);
}

/**
 * Delete an address by its id.
 * @throws if Firestore fails
 */
export async function deleteBuyerAddress(uid, addressId) {
  const profile = await getBuyerProfile(uid);
  const addresses = (profile?.addresses || []).filter(a => a.id !== addressId);

  // Ensure at least one is default
  if (addresses.length > 0 && !addresses.some(a => a.isDefault)) {
    addresses[0].isDefault = true;
  }
  await writeAddresses(uid, addresses);
}

/**
 * Set a specific address as the default.
 * @throws if Firestore fails
 */
export async function setDefaultAddress(uid, addressId) {
  const profile = await getBuyerProfile(uid);
  const addresses = (profile?.addresses || []).map(a => ({
    ...a,
    isDefault: a.id === addressId,
  }));
  await writeAddresses(uid, addresses);
}

/** Generate a short random ID for addresses */
function generateAddressId() {
  return 'addr_' + Math.random().toString(36).slice(2, 10);
}

// ── Firestore helpers (orders subcollection) ──

/**
 * Save an order record under buyers/{uid}/orders/{orderId}.
 * @throws if the write fails
 */
export async function saveBuyerOrder(uid, orderId, data) {
  await setDoc(doc(db, BUYERS_COLLECTION, uid, 'orders', orderId), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

/**
 * Fetch all orders for a buyer, newest first.
 * @returns {Promise<object[]>}
 * @throws if Firestore can't be read
 */
export async function getBuyerOrders(uid) {
  const q = query(
    collection(db, BUYERS_COLLECTION, uid, 'orders'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export { auth, db, MAX_ADDRESSES };

