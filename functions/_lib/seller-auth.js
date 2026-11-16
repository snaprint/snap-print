/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Seller authentication helpers (B-7)

   Helper module (no onRequest* exports, so Pages does not route it).
   Used by /api/seller-login (issue token) and /api/send-shipment (verify).

   Signing key: SELLER_TOKEN_SECRET if set, otherwise RAZORPAY_WEBHOOK_SECRET
   (the old behaviour). Setting SELLER_TOKEN_SECRET invalidates existing
   tokens once; sellers simply log in again.

   SELLER_ACCOUNTS: JSON array. Each account has a username and EITHER
     "passwordHash": "pbkdf2-sha256:<iterations>:<saltBase64>:<hashBase64>"
   OR (legacy, still accepted) a plaintext "password".
   Generate a hash with the command in BACKEND_CONTEXT.md (B-7).
   ═══════════════════════════════════════════════════════════════ */

export const TOKEN_EXPIRY_HOURS = 4;

// Cloudflare Workers' PBKDF2 refuses more than 100,000 iterations.
const PBKDF2_MAX_ITERATIONS = 100000;
const PBKDF2_MIN_ITERATIONS = 10000;
// Used to spend the same time on unknown usernames as on real ones.
const DUMMY_HASH = 'pbkdf2-sha256:100000:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function getSigningSecret(env) {
  return env.SELLER_TOKEN_SECRET || env.RAZORPAY_WEBHOOK_SECRET || '';
}

// ── Accounts ──

/**
 * Parses SELLER_ACCOUNTS. Returns { accounts } or { error } (config problem, logged).
 */
export function loadAccounts(env) {
  const raw = env.SELLER_ACCOUNTS;
  if (!raw) return { error: 'SELLER_ACCOUNTS not configured' };
  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch {
    return { error: 'SELLER_ACCOUNTS is not valid JSON' };
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return { error: 'SELLER_ACCOUNTS is empty or not an array' };
  }
  return { accounts };
}

/**
 * Checks a username/password against the accounts.
 * Usernames are compared in constant time against EVERY account, then exactly
 * one password check runs (against a dummy hash when the username is unknown),
 * so response time doesn't reveal which usernames exist.
 * Returns the matched username or null.
 */
export async function checkCredentials(accounts, username, password) {
  let matched = null;
  for (const account of accounts) {
    if (constantTimeEqual(username, account?.username || '') && account?.username) {
      matched = account;
    }
  }

  if (matched && typeof matched.passwordHash === 'string' && matched.passwordHash) {
    return (await verifyPasswordHash(password, matched.passwordHash)) ? matched.username : null;
  }
  if (matched && typeof matched.password === 'string' && matched.password) {
    return constantTimeEqual(password, matched.password) ? matched.username : null;
  }
  // Unknown username (or account without any password): burn comparable time, then fail.
  // Use the iteration count of a real hashed account so timing (and CPU) match it.
  const hashed = accounts.find(a => typeof a?.passwordHash === 'string' && a.passwordHash.startsWith('pbkdf2-sha256:'));
  if (hashed) {
    const iterations = hashed.passwordHash.split(':')[1];
    await verifyPasswordHash(password, DUMMY_HASH.replace(':100000:', `:${iterations}:`));
  } else {
    constantTimeEqual(password, DUMMY_HASH);
  }
  return null;
}

/** Verifies "pbkdf2-sha256:<iter>:<salt b64>:<hash b64>". Malformed hash → false (logged). */
export async function verifyPasswordHash(password, stored) {
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') {
    console.error('SELLER_ACCOUNTS: malformed passwordHash (expected pbkdf2-sha256:<iter>:<salt>:<hash>)');
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS || iterations > PBKDF2_MAX_ITERATIONS) {
    console.error(`SELLER_ACCOUNTS: passwordHash iterations must be ${PBKDF2_MIN_ITERATIONS}–${PBKDF2_MAX_ITERATIONS}`);
    return false;
  }
  let salt, expected;
  try {
    salt = base64ToBytes(parts[2]);
    expected = base64ToBytes(parts[3]);
  } catch {
    console.error('SELLER_ACCOUNTS: passwordHash salt/hash is not valid base64');
    return false;
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    expected.length * 8,
  );
  return constantTimeEqualBytes(new Uint8Array(bits), expected);
}

// ── Session tokens ──
// Format: base64(JSON{sub, exp, iat}) + "." + hex(HMAC-SHA256(payloadB64, signing secret))

export async function createSessionToken(username, env) {
  const signingSecret = getSigningSecret(env);
  if (!signingSecret) {
    throw new Error('SELLER_TOKEN_SECRET / RAZORPAY_WEBHOOK_SECRET not configured — cannot sign tokens');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: username, exp: now + TOKEN_EXPIRY_HOURS * 3600, iat: now };
  const payloadB64 = btoa(JSON.stringify(payload));
  const signature = await hmacSign(payloadB64, signingSecret);
  return `${payloadB64}.${signature}`;
}

/** Returns { valid: true, username } or { valid: false, reason }. */
export async function verifySessionToken(token, env) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Missing token' };
  }
  const signingSecret = getSigningSecret(env);
  if (!signingSecret) {
    return { valid: false, reason: 'Server configuration error' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Malformed token' };
  }
  const [payloadB64, providedSignature] = parts;
  const expectedSignature = await hmacSign(payloadB64, signingSecret);
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return { valid: false, reason: 'Invalid signature' };
  }
  let payload;
  try {
    payload = JSON.parse(atob(payloadB64));
  } catch {
    return { valid: false, reason: 'Invalid payload' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { valid: false, reason: 'Token expired' };
  }
  if (!payload.sub) {
    return { valid: false, reason: 'Invalid token: missing subject' };
  }
  return { valid: true, username: payload.sub };
}

// ── Crypto helpers ──

export async function hmacSign(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison; always walks the longer string. */
export function constantTimeEqual(a, b) {
  const strA = String(a);
  const strB = String(b);
  const maxLen = Math.max(strA.length, strB.length);
  if (maxLen === 0) return true;
  let mismatch = strA.length !== strB.length ? 1 : 0;
  for (let i = 0; i < maxLen; i++) {
    const charA = i < strA.length ? strA.charCodeAt(i) : 0;
    const charB = i < strB.length ? strB.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

function constantTimeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
