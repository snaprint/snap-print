/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Razorpay Webhook
   
   POST /api/webhook
   
   URL: https://snaprint.in/api/webhook
   
   1. Verifies HMAC-SHA256 signature using RAZORPAY_WEBHOOK_SECRET
   2. Filters events: only processes payment.captured
   3. Idempotency: checks payment ID against processed set
   4. Logs order to Google Sheets via Sheets API
   5. Sends itemized confirmation emails to buyer + seller via Resend
   
   Buyer + item details come from the Razorpay ORDER's notes (set
   server-side by create-order.js), fetched via GET /v1/orders/{id};
   payment.notes is only a fallback. The amount comes from the payment.
   ═══════════════════════════════════════════════════════════════ */
// ═══════════════════════════════════════════════════════════════
// Processing state (B-5)
// KV key `payment:<id>` holds JSON { state: 'processing' | 'done', at, ... }.
//   - 'processing' is a short lock (PROCESSING_TTL_S) so a crashed run can't block retries.
//   - 'done' is written ONLY after the emails succeeded (30-day TTL).
//   - Values written before B-5 were a bare ISO timestamp → treated as 'done'.
// If a run fails, the key is deleted and we answer 5xx so Razorpay retries
// (it retries non-2xx responses for up to 24 h). Resend Idempotency-Keys stop a
// retry from re-sending an email that already went out.
// Without ORDERS_KV: same logic in a per-isolate Map (not durable). Duplicate
// emails are then prevented only by the Resend Idempotency-Keys (24 h).
// ═══════════════════════════════════════════════════════════════
const PROCESSING_TTL_S = 120;                 // KV minimum TTL is 60 s
const DONE_TTL_S = 60 * 60 * 24 * 30;
const SYNC_BUDGET_MS = 4000;                  // answer Razorpay within its ~5 s timeout
const memoryState = new Map();                // fallback when ORDERS_KV is not bound

function stateKey(paymentId) {
  return `payment:${paymentId}`;
}

async function getState(env, paymentId) {
  if (!env.ORDERS_KV) {
    console.warn('ORDERS_KV not bound — using in-memory idempotency (not durable)');
    const entry = memoryState.get(paymentId);
    if (entry && entry.expires < Date.now()) { memoryState.delete(paymentId); return null; }
    return entry ? entry.value : null;
  }
  try {
    const raw = await env.ORDERS_KV.get(stateKey(paymentId));
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.state) return parsed;
    } catch { /* legacy value */ }
    return { state: 'done', at: raw, legacy: true };
  } catch (err) {
    // A KV outage must not stop order emails; Resend idempotency still prevents duplicates.
    console.error('ORDERS_KV read failed — continuing without idempotency check:', err);
    return null;
  }
}

async function setState(env, paymentId, value, ttlSeconds) {
  if (!env.ORDERS_KV) {
    memoryState.set(paymentId, { value, expires: Date.now() + ttlSeconds * 1000 });
    return;
  }
  try {
    await env.ORDERS_KV.put(stateKey(paymentId), JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch (err) {
    console.error(`ORDERS_KV write failed (${value.state}) for ${paymentId}:`, err);
  }
}

async function clearState(env, paymentId) {
  if (!env.ORDERS_KV) {
    memoryState.delete(paymentId);
    return;
  }
  try {
    await env.ORDERS_KV.delete(stateKey(paymentId));
  } catch (err) {
    console.error(`ORDERS_KV delete failed for ${paymentId}:`, err);
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
      return jsonError('Invalid signature', 401);
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
    if (!payment || !payment.id) {
      return jsonError('Invalid payload structure', 400);
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;

    // ── 5. Idempotency ──
    const state = await getState(env, paymentId);
    if (state?.state === 'done') {
      console.log(`Payment ${paymentId} already processed — skipping (idempotent)`);
      return jsonResponse({ received: true, order_id: orderId, duplicate: true });
    }
    if (state?.state === 'processing') {
      // Another run is sending the emails right now. Non-2xx → Razorpay retries later,
      // by which time the key is 'done' (→ 200) or cleared after a failure (→ reprocess).
      console.log(`Payment ${paymentId} is being processed by another request — asking Razorpay to retry`);
      return jsonError('Already processing; retry later', 409);
    }

    await setState(env, paymentId, { state: 'processing', at: new Date().toISOString() }, PROCESSING_TTL_S);
    console.log(`Processing payment.captured: ${paymentId} for order ${orderId}, ₹${payment.amount / 100}`);

    // ── 6. Send the emails; record 'done' only if they succeeded ──
    const work = processPayment(env, payment)
      .catch(err => ({ ok: false, reason: `unexpected error: ${err && err.message ? err.message : err}` }))
      .then(async result => {
        if (result.ok) {
          await setState(env, paymentId, {
            state: 'done',
            at: new Date().toISOString(),
            orderId,
            buyerEmail: result.buyerEmailStatus,
          }, DONE_TTL_S);
        } else {
          console.error(`Payment ${paymentId}: emails not completed (${result.reason}) — will be retried by Razorpay`);
          await clearState(env, paymentId);
        }
        return result;
      });
    // Keep the work alive even if we answer Razorpay before it finishes.
    context.waitUntil(work);

    const outcome = await Promise.race([work, sleep(SYNC_BUDGET_MS).then(() => null)]);
    if (outcome === null) {
      // Still running. Answer non-2xx so Razorpay retries; the retry sees 'done' (→ 200)
      // if this run succeeds, or reprocesses if it fails.
      console.warn(`Payment ${paymentId}: processing exceeded ${SYNC_BUDGET_MS} ms — answering 503, continuing in background`);
      return jsonError('Processing; retry later', 503);
    }
    if (!outcome.ok) {
      return jsonError('Order emails could not be sent; please retry', 500);
    }
    return jsonResponse({ received: true, order_id: orderId });

  } catch (err) {
    console.error('Webhook processing error:', err);
    return jsonError('Internal server error', 500);
  }
}

/**
 * Builds the order details and sends both emails.
 * Returns { ok, reason?, buyerEmailStatus }.
 * ok = seller email sent AND (buyer email sent OR the buyer email failed permanently,
 * e.g. missing/invalid address — retrying would never fix that).
 */
async function processPayment(env, payment) {
  const orderData = await buildOrderData(env, payment);
  return sendConfirmationEmails(env, orderData);
}

// ═══════════════════════════════════════════════════════════════
// Order details (B-4)
// create-order.js puts the buyer + item details in the Razorpay ORDER's notes.
// The payment entity in the webhook does not reliably carry them (Checkout is
// opened with notes: {}), so we fetch the order and use its notes, falling
// back to payment.notes key by key.
// ═══════════════════════════════════════════════════════════════

/** Razorpay returns `notes: []` when empty; normalise to a plain object. */
function asNotes(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * GET /v1/orders/{id}. Returns the order's notes object, or null if the order
 * could not be fetched (missing keys, network error, non-2xx).
 */
async function fetchOrderNotes(env, orderId) {
  const keyId = env.RAZORPAY_KEY_ID || env.VITE_RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!orderId) {
    console.warn('Payment has no order_id — using payment.notes only');
    return null;
  }
  if (!keyId || !keySecret) {
    console.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — cannot fetch order; using payment.notes only');
    return null;
  }
  try {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { 'Authorization': 'Basic ' + btoa(`${keyId}:${keySecret}`) },
    });
    if (!res.ok) {
      console.error(`Razorpay order fetch failed (${res.status}) for ${orderId} — using payment.notes only`);
      return null;
    }
    const order = await res.json();
    return asNotes(order.notes);
  } catch (err) {
    console.error(`Razorpay order fetch error for ${orderId} — using payment.notes only:`, err);
    return null;
  }
}

/** Order notes win; payment notes fill any key that is missing or empty on the order. */
function mergeNotes(orderNotes, paymentNotes) {
  const merged = { ...paymentNotes };
  for (const [key, value] of Object.entries(orderNotes || {})) {
    if (value !== undefined && value !== null && String(value) !== '') merged[key] = value;
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// Items (B-3)
// New orders: notes.items_1 / items_2 / items_3 hold `id:qty:unitPrice` tokens joined by ','
// (id URI-encoded). Names are looked up in the Products sheet (fallback: the id).
// Orders created before B-3: notes.items_detail = JSON [{n,q,p}].
// ═══════════════════════════════════════════════════════════════

/** Map of product id → name from the Products CSV; empty map on any failure. */
async function fetchProductNames(env) {
  const url = env.PRODUCTS_CSV_URL || env.VITE_PRODUCTS_CSV_URL;
  const names = new Map();
  if (!url) return names;
  try {
    const res = await fetch(url, { cf: { cacheTtl: 300 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const p of parseCSV(await res.text())) {
      if (p.id) names.set(p.id, p.name || p.id);
    }
  } catch (err) {
    console.warn('Could not load product names for email — showing ids:', err.message || err);
  }
  return names;
}

function parseItemsFromNotes(notes, productNames) {
  const packed = ['items_1', 'items_2', 'items_3'].map(k => notes[k]).filter(Boolean).join(',');
  if (packed) {
    return packed.split(',').map(token => {
      const [rawId, q, p] = token.split(':');
      let id = rawId;
      try { id = decodeURIComponent(rawId); } catch { /* keep raw */ }
      return { n: productNames.get(id) || id, q: Number(q) || 0, p: Number(p) || 0 };
    });
  }
  if (notes.items_detail) {
    try {
      const legacy = JSON.parse(notes.items_detail);
      if (Array.isArray(legacy)) return legacy;
    } catch {
      console.warn('Could not parse legacy items_detail from notes');
    }
  }
  return [];
}

async function buildOrderData(env, payment) {
  const [orderNotes, productNames] = await Promise.all([
    fetchOrderNotes(env, payment.order_id),
    fetchProductNames(env),
  ]);
  const notes = mergeNotes(orderNotes, asNotes(payment.notes));
  const totalAmount = payment.amount / 100; // paise → rupees
  const itemsDetail = parseItemsFromNotes(notes, productNames);

  const orderData = {
    orderId: payment.order_id,
    paymentId: payment.id,
    totalAmount,
    subtotal: Number(notes.subtotal) || totalAmount,
    shippingCost: Number(notes.shipping_cost) || 0,
    shippingMethod: notes.shipping_method || 'normal',
    buyerUid: notes.buyer_uid || '',
    buyerName: notes.buyer_name || '',
    buyerEmail: notes.buyer_email || payment.email || '',
    buyerPhone: notes.buyer_phone || payment.contact || '',
    buyerAddress: notes.buyer_address || '',
    buyerCity: notes.buyer_city || '',
    buyerState: notes.buyer_state || '',
    buyerPincode: notes.buyer_pincode || '',
    itemCount: notes.item_count || String(itemsDetail.length || ''),
    itemsSummary: notes.items_summary || '',
    itemsDetail,
    // Payment creation time (not "now") so a retried email has an identical payload.
    timestamp: payment.created_at ? new Date(payment.created_at * 1000).toISOString() : '',
    notesSource: orderNotes ? 'order' : 'payment',
  };

  if (!orderData.buyerEmail || !orderData.buyerName) {
    console.error(`Order ${orderData.orderId}: buyer details incomplete after reading ${orderData.notesSource} notes`);
  }
  return orderData;
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
    // B-5: not marked done → Razorpay retries, so emails go out once the key is set (within 24 h).
    console.error('RESEND_API_KEY not configured — order emails NOT sent. Order data:', JSON.stringify(data));
    return { ok: false, reason: 'RESEND_API_KEY not configured', buyerEmailStatus: 'not_sent' };
  }

  const sellerEmail = env.SELLER_EMAIL || 'snaprint.orders@gmail.com';

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

  const methodLower = (data.shippingMethod || '').toLowerCase();
  const shippingLabel = methodLower === 'air'
    ? 'Air Shipping (3–5 business days)'
    : methodLower === 'surface'
      ? 'Surface Shipping (5–10 business days)'
      : `${data.shippingMethod} Shipping`;

  const deliveryEstimate = methodLower === 'air'
    ? '3–5 business days'
    : methodLower === 'surface'
      ? '5–10 business days'
      : 'We will notify you';

  // ── BUYER EMAIL ──
  let buyerEmailStatus = 'sent';
  let buyerRetryable = false;
  if (!isValidEmail(data.buyerEmail)) {
    // Permanent: retrying can't invent an address. The seller email still carries the order.
    console.error(`Order ${data.orderId}: no valid buyer email ("${data.buyerEmail}") — buyer confirmation skipped`);
    buyerEmailStatus = 'skipped_no_address';
  } else try {

    await sendEmailWithRetry(resendApiKey, {
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
    }, 3, `order-confirmed/${data.paymentId}-buyer`);
  } catch (buyerErr) {
    buyerRetryable = isRetryableEmailError(buyerErr);
    buyerEmailStatus = buyerRetryable ? 'failed_retry' : 'failed_permanent';
    console.error(`Buyer confirmation email failed (${buyerRetryable ? 'will retry' : 'permanent, not retried'}):`, buyerErr);
  }

  // Space calls ≥500ms apart to stay under Resend's 2 req/s rate limit
  await sleep(500);

  // ── SELLER EMAIL ──
  try {
    await sendEmailWithRetry(resendApiKey, {
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
            <tr><td style="padding:4px 0;color:#666;">${shippingLabel}</td><td style="padding:4px 0;text-align:right;">₹${data.shippingCost.toLocaleString('en-IN')}</td></tr>
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
            ${data.buyerUid ? `<tr><td style="padding:6px 0;color:#666;">User ID</td><td style="padding:6px 0;font-size:12px;font-family:monospace;">${escapeHtml(data.buyerUid)}</td></tr>` : ''}
          </table>

          <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">Automated notification from Snap Print webhook</p>
        </div>
      `,
    }, 3, `order-received/${data.paymentId}-seller`);
  } catch (sellerErr) {
    // The seller email is what gets the order made: always retry it.
    console.error('Seller notification email failed (will retry):', sellerErr);
    return { ok: false, reason: `seller email failed: ${sellerErr.message}`, buyerEmailStatus };
  }

  if (buyerRetryable) {
    return { ok: false, reason: 'buyer email failed (retryable)', buyerEmailStatus };
  }
  return { ok: true, buyerEmailStatus };
}

/** 429 / 5xx / network errors are worth retrying; other 4xx (bad address, etc.) are not. */
function isRetryableEmailError(err) {
  const status = err && err.status;
  if (!status) return true;            // network / unknown
  if (status === 429 || status >= 500) return true;
  if (status === 409 && /concurrent/i.test(err.message || '')) return true;
  return false;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Delay helper ──
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Resend API call with 429 retry-backoff ──
// Retries up to maxRetries times on 429 rate-limit responses.
// Reads the Retry-After header from Resend; falls back to exponential backoff.
// Any non-429 error (4xx/5xx) is thrown immediately — no retry.
// idempotencyKey: optional Resend Idempotency-Key header to prevent duplicate sends.
async function sendEmailWithRetry(apiKey, emailData, maxRetries = 3, idempotencyKey = '') {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SnapPrint-Webhook/1.0',
    };

    // Resend deduplicates requests with the same Idempotency-Key within 24 hours.
    // This closes the TOCTOU race condition: even if two webhook workers both
    // call Resend, only the first request's email is actually sent.
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(emailData),
    });

    // Success
    if (response.ok) {
      console.log(`Email sent to ${emailData.to} (attempt ${attempt + 1}${idempotencyKey ? ', idempotency-key: ' + idempotencyKey : ''})`);
      return;
    }

    // Rate limited — wait and retry
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? Number(retryAfter) * 1000          // Resend says "wait N seconds"
        : 500 * Math.pow(2, attempt);        // exponential fallback: 500ms, 1s, 2s
      console.warn(`Resend 429 for ${emailData.to} — waiting ${waitMs}ms before retry (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }

    const errText = await response.text();

    // Same Idempotency-Key already used with a different payload → an earlier attempt
    // was accepted by Resend, so this email has already been sent.
    if (response.status === 409 && idempotencyKey && /invalid_idempotent_request/.test(errText)) {
      console.warn(`Resend: ${idempotencyKey} already used — treating as sent`);
      return;
    }

    // Any other error — throw immediately, no retry
    const err = new Error(`Resend API error (${response.status}): ${errText}`);
    err.status = response.status;
    throw err;
  }

  throw new Error(`Resend rate limit: exhausted ${maxRetries} retries for ${emailData.to}`);
}



// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

// CSV parser — same as create-order.js (to be moved to a shared module in B-12)
function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { inQuotes = !inQuotes; current += char; }
    else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (current.trim()) rows.push(current);
      current = '';
    } else { current += char; }
  }
  if (current.trim()) rows.push(current);
  if (rows.length === 0) return [];
  const parseLine = line => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; } }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else if (c !== '\r') { cur += c; }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(rows[0]).map(h => h.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
    return obj;
  });
}

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
