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
