/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Small dependency-free helpers
   Safe to import from any page (no Firebase, no PapaParse).
   ═══════════════════════════════════════════════════════════════ */

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
