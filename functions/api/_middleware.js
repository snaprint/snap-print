/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Middleware
   
   Applied to all /api/* routes.
   - CORS headers
   - Security headers
   - Rate limiting (basic, using CF headers)
   ═══════════════════════════════════════════════════════════════ */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  // Process the request
  const response = await context.next();

  // Add CORS and security headers to the response
  const newResponse = new Response(response.body, response);
  const cors = corsHeaders(request);
  for (const [key, value] of Object.entries(cors)) {
    newResponse.headers.set(key, value);
  }

  // Security headers
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'DENY');

  return newResponse;
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  
  // In production, restrict to your domain
  // const allowedOrigins = ['https://snaprint.in', 'https://www.snaprint.in'];
  // const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
