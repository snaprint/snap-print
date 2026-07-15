/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Razorpay Webhook
   
   POST /api/webhook
   
   URL: https://snaprint.in/api/webhook
   
   1. Verifies HMAC-SHA256 signature using RAZORPAY_WEBHOOK_SECRET
   2. Filters events: only processes payment.captured
   3. Idempotency: checks payment ID against processed set
   4. Logs order to Google Sheets via Sheets API
   5. Sends itemized confirmation emails to buyer + seller via Resend
   
   All amounts and item data come from Razorpay's payment.notes,
   which were set server-side by create-order.js — never re-fetched.
   ═══════════════════════════════════════════════════════════════ */
// In-memory fallback (only effective within a single warm isolate).
// For true persistence, bind a KV namespace as ORDERS_KV.
const processedPaymentsFallback = new Set();

// Persistent idempotency check via Cloudflare KV.
// Returns true if this payment has already been processed.
async function isAlreadyProcessed(env, paymentId) {
  if (env.ORDERS_KV) {
    const existing = await env.ORDERS_KV.get(`payment:${paymentId}`);
    return existing !== null;
  }
  // Fallback: in-memory (not persistent across cold starts)
  console.warn('ORDERS_KV not bound — using in-memory idempotency (not persistent)');
  return processedPaymentsFallback.has(paymentId);
}

// Mark a payment as processed in KV (or fallback Set).
async function markProcessed(env, paymentId) {
  if (env.ORDERS_KV) {
    // Store with 30-day TTL (Razorpay retries are within hours, not months)
    await env.ORDERS_KV.put(`payment:${paymentId}`, new Date().toISOString(), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  } else {
    processedPaymentsFallback.add(paymentId);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    // ── 1. Get raw body and signature ──
    const rawBody = await request.text();
    const signature = request.headers.get('X-Razorpay-Signature');

    if (!signature) {
      return jsonError('Missing signature', 400);
    }

    // ── 2. Verify HMAC-SHA256 signature ──
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return jsonError('Server configuration error', 500);
    }

    const isValid = await verifySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid webhook signature — rejecting');
      return new Response(JSON.stringify({ error: true, message: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Parse event and filter ──
    const event = JSON.parse(rawBody);
    const eventType = event.event;

    // Acknowledge but ignore non-captured events
    if (eventType === 'payment.authorized' || eventType === 'payment.failed') {
      console.log(`Acknowledged ${eventType} — no action taken`);
      return jsonResponse({ received: true, event: eventType, action: 'ignored' });
    }

    if (eventType !== 'payment.captured') {
      console.log(`Unknown event ${eventType} — acknowledging`);
      return jsonResponse({ received: true, event: eventType, action: 'unknown_ignored' });
    }

    // ── 4. Extract payment data ──
    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return jsonError('Invalid payload structure', 400);
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amountPaise = payment.amount;
    const totalAmount = amountPaise / 100; // paise → rupees
    const notes = payment.notes || {};

    // ── 5. Idempotency check (persistent via KV) ──
    if (await isAlreadyProcessed(env, paymentId)) {
      console.log(`Payment ${paymentId} already processed — skipping (idempotent)`);
      return jsonResponse({ received: true, order_id: orderId, duplicate: true });
    }

    // Mark as processed BEFORE doing any work
    await markProcessed(env, paymentId);

    console.log(`Processing payment.captured: ${paymentId} for order ${orderId}, ₹${totalAmount}`);

    // ── 6. Parse item details from notes ──
    let itemsDetail = [];
    try {
      itemsDetail = JSON.parse(notes.items_detail || '[]');
    } catch {
      console.warn('Could not parse items_detail from notes');
    }

    const orderData = {
      orderId,
      paymentId,
      totalAmount,
      subtotal: Number(notes.subtotal) || totalAmount,
      shippingCost: Number(notes.shipping_cost) || 0,
      shippingMethod: notes.shipping_method || 'normal',
      buyerName: notes.buyer_name || '',
      buyerEmail: notes.buyer_email || '',
      buyerPhone: notes.buyer_phone || '',
      buyerAddress: notes.buyer_address || '',
      buyerCity: notes.buyer_city || '',
      buyerState: notes.buyer_state || '',
      buyerPincode: notes.buyer_pincode || '',
      itemCount: notes.item_count || '',
      itemsSummary: notes.items_summary || '',
      itemsDetail,
      timestamp: new Date().toISOString(),
    };

    // ── 7. Log to Google Sheets (best-effort) ──
    try {
      await logToGoogleSheets(env, orderData);
    } catch (sheetErr) {
      console.error('Google Sheets logging failed:', sheetErr);
    }

    // ── 8. Send confirmation emails (best-effort) ──
    try {
      await sendConfirmationEmails(env, orderData);
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr);
    }

    return jsonResponse({ received: true, order_id: orderId });

  } catch (err) {
    console.error('Webhook processing error:', err);
    return jsonError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// HMAC-SHA256 Signature Verification
// ═══════════════════════════════════════════════════════════════
async function verifySignature(body, signature, secret) {
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
    encoder.encode(body)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  if (expectedSignature.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ═══════════════════════════════════════════════════════════════
// Email Sending (Resend.com)
// ═══════════════════════════════════════════════════════════════
async function sendConfirmationEmails(env, data) {
  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.log('Email sending skipped (RESEND_API_KEY not configured)');
    console.log('Order data for manual processing:', JSON.stringify(data));
    return;
  }

  const sellerEmail = env.SELLER_EMAIL || 'queries@snaprint.in';

  // Build itemized table rows
  const itemRows = data.itemsDetail.length > 0
    ? data.itemsDetail.map(item =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(item.n)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.q}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${(item.p * item.q).toLocaleString('en-IN')}</td>
        </tr>`
      ).join('')
    : `<tr><td colspan="3" style="padding:8px 12px;color:#888;">
        ${escapeHtml(data.itemsSummary || `${data.itemCount} item(s)`)}
       </td></tr>`;

  const shippingLabel = data.shippingMethod === 'speed'
    ? 'Speed Shipping (3–5 business days)'
    : 'Standard Shipping (5–10 business days)';

  const deliveryEstimate = data.shippingMethod === 'speed'
    ? '3–5 business days'
    : '5–10 business days';

  // ── BUYER EMAIL ──
  await sendEmail(resendApiKey, {
    from: 'Snap Print <orders@snaprint.in>',
    to: data.buyerEmail,
    reply_to: 'queries@snaprint.in',
    subject: `Order Confirmed — ${data.orderId}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 16px;">Thank you for your order! 🎉</h2>
        <p>Hi ${escapeHtml(data.buyerName)},</p>
        <p>Payment confirmed. We'll notify you with tracking details upon dispatch. Any excess shipping charges will be refunded based on the actual shipping cost.</p>

        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Qty</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">
          <tr><td style="padding:4px 0;color:#666;">Subtotal</td><td style="padding:4px 0;text-align:right;">₹${data.subtotal.toLocaleString('en-IN')}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">${shippingLabel}</td><td style="padding:4px 0;text-align:right;">₹${data.shippingCost.toLocaleString('en-IN')}</td></tr>
          <tr style="font-weight:700;font-size:15px;"><td style="padding:8px 0;border-top:2px solid #1a1a1a;">Total Paid</td><td style="padding:8px 0;text-align:right;border-top:2px solid #1a1a1a;">₹${data.totalAmount.toLocaleString('en-IN')}</td></tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
          <tr><td style="padding:4px 0;color:#666;">Order ID</td><td style="padding:4px 0;">${data.orderId}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Payment ID</td><td style="padding:4px 0;">${data.paymentId}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Estimated Delivery</td><td style="padding:4px 0;font-weight:600;">${deliveryEstimate}</td></tr>
        </table>

        <p style="margin-top:20px;">If you have any questions about your order, just reply to this email.</p>
        <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">— Team Snap Print<br>snaprint.in</p>
      </div>
    `,
  });

  // ── SELLER EMAIL ──
  await sendEmail(resendApiKey, {
    from: 'Snap Print Orders <orders@snaprint.in>',
    to: sellerEmail,
    reply_to: 'queries@snaprint.in',
    subject: `🆕 New Order — ${data.orderId} — ₹${data.totalAmount.toLocaleString('en-IN')}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 16px;">New Order Received</h2>

        <h3 style="margin:16px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Order Details</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:140px;">Order ID</td><td style="padding:6px 0;font-weight:600;">${data.orderId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Payment ID</td><td style="padding:6px 0;">${data.paymentId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Timestamp</td><td style="padding:6px 0;">${data.timestamp}</td></tr>
        </table>

        <h3 style="margin:20px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Items Ordered</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Qty</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">
          <tr><td style="padding:4px 0;color:#666;">Subtotal</td><td style="padding:4px 0;text-align:right;">₹${data.subtotal.toLocaleString('en-IN')}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Shipping (${data.shippingMethod})</td><td style="padding:4px 0;text-align:right;">₹${data.shippingCost.toLocaleString('en-IN')}</td></tr>
          <tr style="font-weight:700;font-size:15px;"><td style="padding:8px 0;border-top:2px solid #1a1a1a;">Total Charged</td><td style="padding:8px 0;text-align:right;border-top:2px solid #1a1a1a;">₹${data.totalAmount.toLocaleString('en-IN')}</td></tr>
        </table>

        <h3 style="margin:20px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Buyer Information</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:140px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.buyerName)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${escapeHtml(data.buyerEmail)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${escapeHtml(data.buyerPhone)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Address</td><td style="padding:6px 0;">${escapeHtml(data.buyerAddress)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">City</td><td style="padding:6px 0;">${escapeHtml(data.buyerCity)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">State</td><td style="padding:6px 0;">${escapeHtml(data.buyerState)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Pincode</td><td style="padding:6px 0;">${escapeHtml(data.buyerPincode)}</td></tr>
        </table>

        <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">Automated notification from Snap Print webhook</p>
      </div>
    `,
  });
}

async function sendEmail(apiKey, emailData) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend API error (${response.status}): ${err}`);
  }

  console.log(`Email sent to ${emailData.to}`);
}

// ═══════════════════════════════════════════════════════════════
// Google Sheets Logging
// ═══════════════════════════════════════════════════════════════
async function logToGoogleSheets(env, data) {
  const serviceAccountJSON = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJSON) {
    console.log('Google Sheets logging skipped (no service account configured)');
    console.log('Order data:', JSON.stringify(data));
    return;
  }

  const creds = JSON.parse(serviceAccountJSON);
  const token = await getGoogleAccessToken(creds);

  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('GOOGLE_SPREADSHEET_ID not set');
    return;
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Orders!A:N:append?valueInputOption=USER_ENTERED`;
  
  const row = [
    data.timestamp,
    data.orderId,
    data.paymentId,
    data.totalAmount,
    data.subtotal,
    data.shippingCost,
    data.shippingMethod,
    data.buyerName,
    data.buyerEmail,
    data.buyerPhone,
    `${data.buyerAddress}, ${data.buyerCity}, ${data.buyerState} ${data.buyerPincode}`,
    data.itemsSummary,
    data.itemCount,
    'PAID',
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Sheets API error: ${err}`);
  }

  console.log('Order logged to Google Sheets successfully');
}

// ── Google OAuth2 JWT Token ──
async function getGoogleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemContent = credentials.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const keyData = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get Google access token');
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
