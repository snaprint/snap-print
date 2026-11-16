/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Seller Login

   POST /api/seller-login

   Multi-seller credential verification.
   - SELLER_ACCOUNTS: JSON array of {username, passwordHash} (PBKDF2) or
     legacy {username, password} (plaintext, still accepted)
   - Constant-time username matching; one password check per attempt
   - Issues an HMAC-SHA256 signed session token (4-hour expiry)
   - Failed attempts are logged WITHOUT the submitted username (B-7)

   Env vars: SELLER_ACCOUNTS, SELLER_TOKEN_SECRET (optional; falls back
   to RAZORPAY_WEBHOOK_SECRET)
   Logic lives in functions/_lib/seller-auth.js.
   ═══════════════════════════════════════════════════════════════ */

import { loadAccounts, checkCredentials, createSessionToken, getSigningSecret } from '../_lib/seller-auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { username, password } = body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password ||
        username.length > 200 || password.length > 200) {
      return jsonError('Invalid credentials', 401);
    }

    const { accounts, error } = loadAccounts(env);
    if (error) {
      console.error(error);
      return jsonError('Server configuration error', 500);
    }
    if (!getSigningSecret(env)) {
      console.error('SELLER_TOKEN_SECRET / RAZORPAY_WEBHOOK_SECRET not configured — cannot sign tokens');
      return jsonError('Server configuration error', 500);
    }

    const matchedUsername = await checkCredentials(accounts, username, password);
    if (!matchedUsername) {
      // Never log the submitted username: it is often a mistyped password.
      console.log('Failed seller login attempt');
      return jsonError('Invalid credentials', 401);
    }

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

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
