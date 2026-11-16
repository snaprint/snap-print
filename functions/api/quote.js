/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Quote Submission
   
   POST /api/quote
   
   Receives quote form data (file + details) and sends emails:
   1. Seller notification with file attachment
   2. Client confirmation with quote summary
   
   Env vars: RESEND_API_KEY, SELLER_EMAIL
   ═══════════════════════════════════════════════════════════════ */

import { verifyTurnstile } from '../_lib/turnstile.js';
import { jsonError, jsonResponse } from '../_lib/http.js';
import { sendEmailWithRetry, sleep, escapeHtml, subjectText, getSellerEmail, FROM_ORDERS, REPLY_TO_QUERIES } from '../_lib/email.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const formData = await request.formData();

    const name = formData.get('name');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const material = formData.get('material');
    const notes = formData.get('notes') || '';
    const file = formData.get('file');

    // Validate required fields
    if (!name || !email || !phone || !material) {
      return jsonError('Missing required fields', 400);
    }

    if (!file || !(file instanceof File)) {
      return jsonError('No design file uploaded', 400);
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.stl') && !fileName.endsWith('.step') && !fileName.endsWith('.stp')) {
      return jsonError('Invalid file type. Please upload STL, STEP, or STP files.', 400);
    }

    // Validate file size (25MB)
    if (file.size > 25 * 1024 * 1024) {
      return jsonError('File too large. Maximum size is 25MB.', 400);
    }

    // B-6: bot check (only enforced when TURNSTILE_SECRET_KEY is set).
    // Accepts our field name or the widget's auto-injected one.
    const turnstile = await verifyTurnstile(env, request, formData.get('turnstileToken') || formData.get('cf-turnstile-response'));
    if (!turnstile.ok) {
      return jsonError(turnstile.message, turnstile.status);
    }

    console.log(`Quote request from ${name} (${email}) — Material: ${material}, File: ${file.name}`);

    // Send email notifications
    const resendApiKey = env.RESEND_API_KEY;
    const sellerEmail = env.SELLER_EMAIL || 'queries@snaprint.in';

    // B-9: the request only counts as received once the SELLER has the email.
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured — quote request NOT delivered', { fileName: file.name, material });
      return jsonError('Our quote service is temporarily unavailable. Please email your file to queries@snaprint.in.', 503);
    }

    // Convert file to base64 for email attachment (chunked to avoid stack overflow)
    const fileBuffer = await file.arrayBuffer();
    const fileBase64 = uint8ArrayToBase64(new Uint8Array(fileBuffer));
    const fileSizeFormatted = formatFileSize(file.size);
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // ── SELLER EMAIL (with attachment) ──
    try {
      await sendEmailWithRetry(resendApiKey, {
        from: FROM_ORDERS,
        to: sellerEmail,
        reply_to: email,
        subject: `🔧 New Quote Request from ${escapeHtml(name)}`,
        html: buildSellerEmail({ name, email, phone, material, notes, fileName: file.name, fileSizeFormatted, timestamp }),
        attachments: [
          {
            filename: file.name,
            content: fileBase64,
          },
        ],
      });
      console.log(`Quote notification sent to seller (${sellerEmail})`);
    } catch (sellerErr) {
      console.error('Seller email failed — returning 502:', sellerErr);
      return jsonError("We couldn't submit your request right now. Please try again in a few minutes, or email your file to queries@snaprint.in.", 502);
    }

    // Rate-limit gap (Resend allows 2 req/s)
    await sleep(500);

    // ── CLIENT CONFIRMATION EMAIL ──
    try {
      await sendEmailWithRetry(resendApiKey, {
        from: FROM_ORDERS,
        to: email,
        reply_to: REPLY_TO_QUERIES,
        subject: 'Quote Request Received — Snap Print',
        html: buildClientEmail({ name, material, notes, fileName: file.name, fileSizeFormatted, timestamp }),
      });
      console.log(`Quote confirmation sent to client (${email})`);
    } catch (clientErr) {
      // The seller has the request; a failed confirmation must not make the user resubmit.
      console.error('Client confirmation email failed (seller already notified):', clientErr);
    }

    return jsonResponse({ success: true, message: 'Quote request submitted' });

  } catch (err) {
    console.error('Quote submission error:', err);
    return jsonError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// Chunked Base64 Conversion
// Processes the Uint8Array in 8KB chunks to avoid call stack
// overflow that occurs with btoa(String.fromCharCode(...largeArray))
// ═══════════════════════════════════════════════════════════════
function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════════
// Email Templates
// ═══════════════════════════════════════════════════════════════

function buildSellerEmail({ name, email, phone, material, notes, fileName, fileSizeFormatted, timestamp }) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;">New Custom Part Quote Request</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#888;">Received on ${timestamp}</p>

      <h3 style="margin:16px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Contact Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#2563eb;">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;"><a href="tel:${escapeHtml(phone)}" style="color:#2563eb;">${escapeHtml(phone)}</a></td></tr>
      </table>

      <h3 style="margin:20px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Specifications</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">Material</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(material)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">File</td><td style="padding:6px 0;">${escapeHtml(fileName)} (${fileSizeFormatted})</td></tr>
        ${notes ? `<tr><td style="padding:6px 0;color:#666;vertical-align:top;">Notes</td><td style="padding:6px 0;">${escapeHtml(notes)}</td></tr>` : ''}
      </table>

      <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">The design file is attached to this email. Reply directly to respond to the customer.</p>
    </div>
  `;
}

function buildClientEmail({ name, material, notes, fileName, fileSizeFormatted, timestamp }) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 16px;">We've received your quote request! 🎉</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for reaching out to Snap Print. We've received your custom part request and our team will review it shortly.</p>

      <h3 style="margin:24px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Your Request Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 12px;color:#666;width:140px;border-bottom:1px solid #eee;">Material</td>
          <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #eee;">${escapeHtml(material)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666;border-bottom:1px solid #eee;">Design File</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(fileName)} (${fileSizeFormatted})</td>
        </tr>
        ${notes ? `
        <tr style="background:#f9fafb;">
          <td style="padding:10px 12px;color:#666;vertical-align:top;border-bottom:1px solid #eee;">Notes</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(notes)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px 12px;color:#666;">Submitted</td>
          <td style="padding:10px 12px;">${timestamp}</td>
        </tr>
      </table>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#166534;">What happens next?</p>
        <p style="margin:0;font-size:14px;color:#15803d;">Our team will review your design file and email you a detailed quote within 24 hours. For complex parts, it may take up to 48 hours.</p>
      </div>

      <p style="margin-top:20px;">If you have any questions in the meantime, just reply to this email.</p>

      <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">— Team Snap Print<br>snaprint.in</p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// Resend API with retry (429 backoff)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

