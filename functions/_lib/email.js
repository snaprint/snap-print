/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Email helpers (Resend) for Pages Functions (B-12)

   Helper module (no onRequest* exports, so Pages does not route it).
   Resend free tier: 2 requests/s → callers space sends ≥500 ms apart.
   ═══════════════════════════════════════════════════════════════ */

export const FROM_ORDERS = 'Snap Print <orders@snaprint.in>';
export const REPLY_TO_QUERIES = 'queries@snaprint.in';

/**
 * Where seller notifications go: SELLER_EMAIL, or one default for every endpoint (B-13).
 * Set SELLER_EMAIL in every Cloudflare environment; the default is a safety net.
 */
export const DEFAULT_SELLER_EMAIL = 'snaprint.orders@gmail.com';
export function getSellerEmail(env) {
  if (!env.SELLER_EMAIL) console.warn(`SELLER_EMAIL not set — using default ${DEFAULT_SELLER_EMAIL}`);
  return env.SELLER_EMAIL || DEFAULT_SELLER_EMAIL;
}

const MAX_RETRY_WAIT_MS = 10000;

/**
 * POST https://api.resend.com/emails with retry on 429 only.
 * - Honours Retry-After (capped at 10 s), else 500 ms × 2^attempt.
 * - Any other non-2xx throws an Error with `.status` set (no retry).
 * - With an idempotencyKey, Resend de-duplicates for 24 h. A 409
 *   `invalid_idempotent_request` (same key, different payload) means an earlier
 *   attempt was accepted, so it is treated as sent.
 * - Network errors throw (no `.status`).
 */
export async function sendEmailWithRetry(apiKey, emailData, { idempotencyKey = '', maxRetries = 3, userAgent = 'SnapPrint/1.0' } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      console.log(`Email sent (attempt ${attempt + 1}${idempotencyKey ? ', idempotency-key: ' + idempotencyKey : ''})`);
      return;
    }

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_WAIT_MS)
        : 500 * Math.pow(2, attempt);
      console.warn(`Resend 429 — waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }

    const errText = await response.text();
    if (response.status === 409 && idempotencyKey && /invalid_idempotent_request/.test(errText)) {
      console.warn(`Resend: ${idempotencyKey} already used — treating as sent`);
      return;
    }
    const err = new Error(`Resend API error (${response.status}): ${errText}`);
    err.status = response.status;
    throw err;
  }

  const err = new Error(`Resend rate limit: exhausted ${maxRetries} retries`);
  err.status = 429;
  throw err;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Escapes text for HTML element content AND quoted attribute values. */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For email Subject lines: plain text, no HTML escaping, no line breaks, bounded length. */
export function subjectText(text, maxLength = 120) {
  return String(text ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
