/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Razorpay Webhook
   
   POST /api/webhook
   
   Receives payment.captured event from Razorpay.
   1. Verifies HMAC-SHA256 signature (non-negotiable)
   2. Logs order to Google Sheets (Orders Sheet) via Sheets API
   3. Sends confirmation emails to buyer + seller
   ═══════════════════════════════════════════════════════════════ */

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    // 1. Get raw body and signature
    const rawBody = await request.text();
    const signature = request.headers.get('X-Razorpay-Signature');

    if (!signature) {
      return jsonError('Missing signature', 400);
    }

    // 2. Verify HMAC-SHA256 signature
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET;
    if (!webhookSecret) {
      console.error('Webhook secret not configured');
      return jsonError('Server configuration error', 500);
    }

    const isValid = await verifySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return jsonError('Invalid signature', 401);
    }

    // 3. Parse event
    const event = JSON.parse(rawBody);
    const eventType = event.event;

    // Only process payment.captured
    if (eventType !== 'payment.captured') {
      return new Response(JSON.stringify({ received: true, skipped: eventType }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return jsonError('Invalid payload structure', 400);
    }

    const orderId = payment.order_id;
    const paymentId = payment.id;
    const amount = payment.amount / 100; // paise to rupees
    const notes = payment.notes || {};

    console.log(`Payment captured: ${paymentId} for order ${orderId}, ₹${amount}`);

    // 4. Log to Google Sheets (best-effort — don't fail the webhook if this errors)
    try {
      await logToGoogleSheets(env, {
        orderId,
        paymentId,
        amount,
        buyerName: notes.buyer_name || '',
        buyerEmail: notes.buyer_email || '',
        buyerPhone: notes.buyer_phone || '',
        buyerCity: notes.buyer_city || '',
        buyerPincode: notes.buyer_pincode || '',
        shippingMethod: notes.shipping_method || '',
        itemCount: notes.item_count || '',
        timestamp: new Date().toISOString(),
        status: 'PAID',
      });
    } catch (sheetErr) {
      console.error('Google Sheets logging failed:', sheetErr);
      // Don't fail the webhook — payment is already captured
    }

    // 5. Send confirmation emails (best-effort)
    try {
      await sendEmails(env, {
        orderId,
        paymentId,
        amount,
        buyerName: notes.buyer_name || '',
        buyerEmail: notes.buyer_email || '',
        buyerPhone: notes.buyer_phone || '',
        buyerCity: notes.buyer_city || '',
        buyerPincode: notes.buyer_pincode || '',
        shippingMethod: notes.shipping_method || '',
        itemCount: notes.item_count || '',
      });
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr);
    }

    return new Response(JSON.stringify({ received: true, order_id: orderId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Webhook processing error:', err);
    return jsonError('Internal server error', 500);
  }
}

// ── HMAC-SHA256 Signature Verification ──
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

  return expectedSignature === signature;
}

// ── Google Sheets Logging ──
async function logToGoogleSheets(env, data) {
  // Uses Google Sheets API v4 with a service account
  // For now, logs to console. To enable:
  // 1. Create a Google Cloud service account
  // 2. Share the spreadsheet with the service account email
  // 3. Set GOOGLE_SERVICE_ACCOUNT_JSON env var
  
  const serviceAccountJSON = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJSON) {
    console.log('Google Sheets logging skipped (no service account configured)');
    console.log('Order data:', JSON.stringify(data));
    return;
  }

  // Parse service account credentials
  const creds = JSON.parse(serviceAccountJSON);
  const token = await getGoogleAccessToken(creds);

  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('GOOGLE_SPREADSHEET_ID not set');
    return;
  }

  // Append row to "Orders" sheet
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Orders!A:L:append?valueInputOption=USER_ENTERED`;
  
  const row = [
    data.timestamp,
    data.orderId,
    data.paymentId,
    data.amount,
    data.buyerName,
    data.buyerEmail,
    data.buyerPhone,
    data.buyerCity,
    data.buyerPincode,
    data.shippingMethod,
    data.itemCount,
    data.status,
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

  // Import RSA private key
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

  // Exchange JWT for access token
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

// ── Email Sending (Resend.com) ──
async function sendEmails(env, data) {
  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.log('Email sending skipped (RESEND_API_KEY not configured)');
    console.log('Would send email for order:', data.orderId);
    return;
  }

  const sellerEmail = env.SELLER_EMAIL || 'hello@snaprint.in';

  // Email to buyer
  await sendEmail(resendApiKey, {
    from: 'Snap Print <orders@snaprint.in>',
    to: data.buyerEmail,
    subject: `Order Confirmed — ${data.orderId}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <h2 style="margin-bottom:16px;">Thank you for your order! 🎉</h2>
        <p>Hi ${data.buyerName},</p>
        <p>Your payment of <strong>₹${data.amount}</strong> has been received. We'll start working on your order right away.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#666;">Order ID</td><td style="padding:6px 0;font-weight:600;">${data.orderId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Payment ID</td><td style="padding:6px 0;">${data.paymentId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:600;">₹${data.amount}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Shipping</td><td style="padding:6px 0;">${data.shippingMethod === 'speed' ? 'Speed (3–5 days)' : 'Normal (7–10 days)'}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Delivery to</td><td style="padding:6px 0;">${data.buyerCity} — ${data.buyerPincode}</td></tr>
        </table>
        <p>If you have any questions, just reply to this email.</p>
        <p style="color:#666;font-size:12px;margin-top:24px;">— Team Snap Print</p>
      </div>
    `,
  });

  // Email to seller
  await sendEmail(resendApiKey, {
    from: 'Snap Print System <orders@snaprint.in>',
    to: sellerEmail,
    subject: `🆕 New Order — ${data.orderId} — ₹${data.amount}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;padding:20px;">
        <h2>New Order Received</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#666;">Order</td><td style="padding:6px 0;font-weight:600;">${data.orderId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${data.paymentId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:600;">₹${data.amount}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Items</td><td style="padding:6px 0;">${data.itemCount} item(s)</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Buyer</td><td style="padding:6px 0;">${data.buyerName}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${data.buyerEmail}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${data.buyerPhone}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Ship to</td><td style="padding:6px 0;">${data.buyerCity} — ${data.buyerPincode}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Shipping</td><td style="padding:6px 0;">${data.shippingMethod}</td></tr>
        </table>
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
    throw new Error(`Resend API error: ${err}`);
  }

  console.log(`Email sent to ${emailData.to}`);
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
