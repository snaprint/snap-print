/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Seller Login
   
   POST /api/seller-login
   
   Multi-seller credential verification.
   - Parses SELLER_ACCOUNTS env var (JSON array of {username,password})
   - Constant-time comparison on both username and password
   - Issues HMAC-SHA256 signed session token (4-hour expiry)
   
   Env vars: SELLER_ACCOUNTS, RAZORPAY_WEBHOOK_SECRET (used as signing salt)
   ═══════════════════════════════════════════════════════════════ */

const TOKEN_EXPIRY_HOURS = 4;

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return jsonError('Invalid credentials', 401);
    }

    // ── Parse seller accounts ──
    const accountsRaw = env.SELLER_ACCOUNTS;
    if (!accountsRaw) {
      console.error('SELLER_ACCOUNTS not configured');
      return jsonError('Server configuration error', 500);
    }

    let accounts;
    try {
      accounts = JSON.parse(accountsRaw);
    } catch {
      console.error('SELLER_ACCOUNTS is not valid JSON');
      return jsonError('Server configuration error', 500);
    }

    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.error('SELLER_ACCOUNTS is empty or not an array');
      return jsonError('Server configuration error', 500);
    }

    // ── Constant-time credential check ──
    // Check ALL accounts to prevent timing-based username enumeration.
    // Even if we find a match early, we continue checking the rest.
    let matchedUsername = null;

    for (const account of accounts) {
      const usernameMatch = constantTimeEqual(username, account.username || '');
      const passwordMatch = constantTimeEqual(password, account.password || '');

      if (usernameMatch && passwordMatch) {
        matchedUsername = account.username;
      }
    }

    if (!matchedUsername) {
      console.log(`Failed login attempt for username: "${username}"`);
      return jsonError('Invalid credentials', 401);
    }

    // ── Issue signed session token ──
    const token = await createSessionToken(matchedUsername, env);

    console.log(`Seller "${matchedUsername}" logged in successfully`);

    return new Response(JSON.stringify({
      success: true,
      token,
      username: matchedUsername,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Seller login error:', err);
    return jsonError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// Session Token (HMAC-SHA256 signed)
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a signed token: base64(payload).base64(signature)
 * Payload: { username, exp } where exp is Unix timestamp
 * Signed with HMAC-SHA256 using RAZORPAY_WEBHOOK_SECRET as key
 */
async function createSessionToken(username, env) {
  const signingSecret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!signingSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET not configured — cannot sign tokens');
  }

  const payload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_HOURS * 3600),
    iat: Math.floor(Date.now() / 1000),
  };

  const payloadB64 = btoa(JSON.stringify(payload));
  const signature = await hmacSign(payloadB64, signingSecret);

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a session token.
 * Returns { valid: true, username } or { valid: false, reason }
 * NOTE: This function is duplicated (inlined) in send-shipment.js because
 * Cloudflare Pages Functions do not support cross-file imports.
 */
async function verifySessionToken(token, env) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Missing token' };
  }

  const signingSecret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!signingSecret) {
    return { valid: false, reason: 'Server configuration error' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Malformed token' };
  }

  const [payloadB64, providedSignature] = parts;

  // Verify signature
  const expectedSignature = await hmacSign(payloadB64, signingSecret);
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  // Parse and check expiry
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

// ═══════════════════════════════════════════════════════════════
// Crypto Helpers
// ═══════════════════════════════════════════════════════════════

async function hmacSign(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Always compares the full length of the longer string.
 */
function constantTimeEqual(a, b) {
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

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
