/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Send Shipment Email
   
   POST /api/send-shipment
   
   Authenticated endpoint — requires a valid session token from
   /api/seller-login. Sends a branded "order shipped" notification
   email to the buyer via Resend.
   
   Env vars: RESEND_API_KEY, SELLER_ACCOUNTS, RAZORPAY_WEBHOOK_SECRET
   ═══════════════════════════════════════════════════════════════ */

// ── Session Token Verification (inlined — Pages Functions don't support cross-file imports) ──

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

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { buyerName, buyerEmail, orderId, shipmentPartner, trackingLink, items, token } = body;

    // ── 1. Verify session token ──
    const auth = await verifySessionToken(token, env);
    if (!auth.valid) {
      console.log(`Shipment email rejected — token issue: ${auth.reason}`);
      return jsonError('Unauthorized — please log in again', 401);
    }

    console.log(`Seller "${auth.username}" sending shipment email`);

    // ── 2. Validate required fields ──
    if (!buyerName || !buyerName.trim()) {
      return jsonError('Buyer name is required', 400);
    }
    if (!buyerEmail || !buyerEmail.trim() || !isValidEmail(buyerEmail)) {
      return jsonError('A valid buyer email is required', 400);
    }
    if (!shipmentPartner || !shipmentPartner.trim()) {
      return jsonError('Shipment partner is required', 400);
    }

    // ── 3. Check Resend config ──
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return jsonError('Email service not configured', 500);
    }

    // ── 4. Build and send email ──
    const emailHtml = buildShipmentEmail({
      buyerName: buyerName.trim(),
      orderId: orderId?.trim() || '',
      shipmentPartner: shipmentPartner.trim(),
      trackingLink: trackingLink?.trim() || '',
      items: Array.isArray(items) ? items : [],
    });

    const subject = orderId?.trim()
      ? `Your Order Has Been Shipped! 📦 — ${orderId.trim()}`
      : 'Your Order Has Been Shipped! 📦';

    await sendEmailWithRetry(resendApiKey, {
      from: 'Snap Print <orders@snaprint.in>',
      to: buyerEmail.trim(),
      reply_to: 'queries@snaprint.in',
      subject,
      html: emailHtml,
    });

    console.log(`Shipment email sent to ${buyerEmail} by seller "${auth.username}"`);

    return new Response(JSON.stringify({
      success: true,
      message: `Shipment notification sent to ${buyerEmail}`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Send shipment error:', err);
    return jsonError(err.message || 'Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// Email Template
// ═══════════════════════════════════════════════════════════════

function buildShipmentEmail({ buyerName, orderId, shipmentPartner, trackingLink, items }) {

  // ── Items table rows ──
  const hasItems = items.length > 0;
  const itemRows = hasItems
    ? items.map(item => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(item.name || '')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">× ${Number(item.quantity) || 1}</td>
        </tr>
      `).join('')
    : '';

  const itemsSection = hasItems ? `
    <h3 style="margin:24px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Items in This Shipment</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
          <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  ` : '';

  // ── Order ID row (only if provided) ──
  const orderIdRow = orderId ? `
    <tr><td style="padding:6px 0;color:#666;width:140px;">Order ID</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(orderId)}</td></tr>
  ` : '';

  // ── Secondary tracking link (only if provided) ──
  const secondaryTrackingSection = trackingLink ? `
    <p style="margin:16px 0 0;font-size:14px;color:#555;">
      You can also track your shipment directly on ${escapeHtml(shipmentPartner)}'s website:<br>
      <a href="${escapeHtml(trackingLink)}" style="color:#2563eb;text-decoration:underline;" target="_blank" rel="noopener noreferrer">${escapeHtml(trackingLink)}</a>
    </p>
  ` : '';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 16px;">Your order is on its way! 📦</h2>
      <p>Hi ${escapeHtml(buyerName)},</p>
      <p>Great news! Your order has been shipped via <strong>${escapeHtml(shipmentPartner)}</strong>.</p>

      <h3 style="margin:24px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Shipment Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${orderIdRow}
        <tr><td style="padding:6px 0;color:#666;width:140px;">Shipped Via</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(shipmentPartner)}</td></tr>
      </table>

      ${itemsSection}

      <div style="margin:28px 0;text-align:center;">
        <a href="https://snaprint.in/track-order.html" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;" target="_blank" rel="noopener noreferrer">
          Track Your Order
        </a>
      </div>

      ${secondaryTrackingSection}

      <p style="margin-top:24px;">If you have any questions about your shipment, just reply to this email.</p>

      <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">— Team Snap Print<br>snaprint.in</p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// Resend API with retry (429 backoff)
// ═══════════════════════════════════════════════════════════════

async function sendEmailWithRetry(apiKey, emailData, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SnapPrint-Shipment/1.0',
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      console.log(`Email sent to ${emailData.to} (attempt ${attempt + 1})`);
      return;
    }

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? Number(retryAfter) * 1000
        : 500 * Math.pow(2, attempt);
      console.warn(`Resend 429 for ${emailData.to} — waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }

    const errText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errText}`);
  }

  throw new Error(`Resend rate limit: exhausted ${maxRetries} retries for ${emailData.to}`);
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
