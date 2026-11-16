/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Small dependency-free helpers
   Safe to import from any page (no Firebase, no PapaParse).
   ═══════════════════════════════════════════════════════════════ */

/**
 * F-12: escape a value for use inside HTML text or a quoted attribute.
 * Use it for EVERY sheet / localStorage / Firestore / user value put into
 * innerHTML or an HTML template string. (URLs in href also need a scheme
 * check; ids in query strings also need encodeURIComponent.)
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shown when the request never reached the server (offline, DNS, blocked). */
export const NETWORK_ERROR_MESSAGE =
  'Could not reach Snap Print. Please check your internet connection and try again.';

/**
 * Reads the user-facing error message from a non-2xx API response.
 * The API always answers `{ error: true, message }` (see agents/API_CONTRACT.md),
 * but a proxy/CDN error page may be HTML, so fall back to `fallback`.
 */
export async function readApiError(response, fallback = 'Something went wrong. Please try again.') {
  try {
    const data = await response.json();
    if (data && typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  } catch { /* not JSON */ }
  return fallback;
}

/**
 * fetch() that turns a network failure into an Error with a friendly message.
 * Never pretends a request succeeded.
 */
export async function apiFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error('[API] Network error:', err);
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
}

/**
 * F-18: seconds-since-epoch expiry of a seller token, or 0 if unreadable.
 * Token = base64(JSON {sub, exp, iat}) + "." + signature (API_CONTRACT seller-login).
 * Only used to send the seller back to login early; the server still decides.
 */
export function sellerTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(String(token).split('.')[0]));
    return Number(payload.exp) || 0;
  } catch {
    return 0;
  }
}

/** True when there is no usable seller token (missing, unreadable or expired). */
export function sellerTokenExpired(token, nowMs = Date.now()) {
  if (!token) return true;
  return sellerTokenExpiry(token) * 1000 <= nowMs;
}
