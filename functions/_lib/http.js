/* SNAP PRINT — JSON response helpers for Pages Functions (B-12).
   Helper module (no onRequest* exports, so Pages does not route it). */

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Standard error shape from agents/API_CONTRACT.md: { error: true, message }. */
export function jsonError(message, status = 400) {
  return jsonResponse({ error: true, message }, status);
}
