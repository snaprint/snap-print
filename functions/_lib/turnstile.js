/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Turnstile verification (B-6)

   Helper module (no onRequest* exports, so Pages does not route it).

   Switch: verification runs ONLY when the TURNSTILE_SECRET_KEY env var
   is set. Without it every request passes (today's behaviour), so the
   key must be added only after the frontend widget (F-20) is live in
   that same environment, or the forms will start failing.
   ═══════════════════════════════════════════════════════════════ */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @returns {Promise<{ ok: boolean, skipped?: boolean, status?: number, message?: string }>}
 *   ok=false comes with the HTTP status + user-facing message to return.
 */
export async function verifyTurnstile(env, request, token) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  const fail = { ok: false, status: 403, message: 'Please complete the security check and try again.' };
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    return fail;
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token.trim());
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form });
    const data = await res.json();
    if (data && data.success === true) return { ok: true };
    console.warn('Turnstile rejected token:', (data && data['error-codes']) || res.status);
    return fail;
  } catch (err) {
    console.error('Turnstile siteverify unreachable:', err);
    return { ok: false, status: 503, message: 'Security check is temporarily unavailable. Please try again in a minute.' };
  }
}
