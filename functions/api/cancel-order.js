/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Cancel Order Request
   
   POST /api/cancel-order
   
   Unauthenticated (public buyer endpoint).
   Receives cancellation details + screenshot, sends notification
   emails to both seller and buyer via Resend.
   
   Env vars: RESEND_API_KEY, SELLER_EMAIL
   ═══════════════════════════════════════════════════════════════ */

import { verifyTurnstile } from '../_lib/turnstile.js';
import { jsonError, jsonResponse } from '../_lib/http.js';
import { sendEmailWithRetry, sleep, escapeHtml, subjectText, isValidEmail, getSellerEmail, FROM_ORDERS, REPLY_TO_QUERIES } from '../_lib/email.js';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { orderId, name, email, phone, reason, screenshot, turnstileToken } = body;

    // ── 1. Validate required fields ──
    if (!orderId || !orderId.trim()) {
      return jsonError('Order ID is required', 400);
    }
    if (!name || !name.trim()) {
      return jsonError('Full name is required', 400);
    }
    if (!email || !email.trim() || !isValidEmail(email)) {
      return jsonError('A valid email address is required', 400);
    }
    if (!phone || !phone.trim()) {
      return jsonError('Phone number is required', 400);
    }
    if (!reason || !reason.trim()) {
      return jsonError('Cancellation reason is required', 400);
    }

    // ── 2. Validate screenshot ──
    if (!screenshot || !screenshot.data || !screenshot.filename) {
      return jsonError('Order confirmation screenshot is required', 400);
    }

    // Base64 encoded data is ~33% larger than raw bytes
    const estimatedBytes = (screenshot.data.length * 3) / 4;
    if (estimatedBytes > MAX_SCREENSHOT_BYTES) {
      return jsonError('Screenshot must be under 5 MB', 400);
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(screenshot.contentType)) {
      return jsonError('Screenshot must be a PNG, JPG, or WebP image', 400);
    }

    // ── 2b. Bot check (B-6; only enforced when TURNSTILE_SECRET_KEY is set) ──
    const turnstile = await verifyTurnstile(env, request, turnstileToken);
    if (!turnstile.ok) {
      return jsonError(turnstile.message, turnstile.status);
    }

    // ── 3. Check Resend config ──
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return jsonError('Email service not configured', 500);
    }

    // ── 4. Build timestamp ──
    const nowUTC = new Date();
    const cancellationTimestamp = nowUTC.toISOString();
    // IST display string (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(nowUTC.getTime() + istOffset);
    const istDisplay = istDate.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const sellerEmail = getSellerEmail(env);

    const emailData = {
      orderId: orderId.trim(),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      reason: reason.trim(),
      cancellationTimestamp,
      istDisplay,
      screenshot: {
        data: screenshot.data,
        filename: screenshot.filename,
        contentType: screenshot.contentType,
      },
    };

    // ── 5. Send seller notification email (with screenshot attachment) ──
    try {
      await sendEmailWithRetry(resendApiKey, {
        from: FROM_ORDERS,
        to: sellerEmail,
        reply_to: email.trim(),
        subject: subjectText(`⚠️ Cancellation Request — ${emailData.orderId}`),
        html: buildSellerEmail(emailData),
        attachments: [
          {
            filename: emailData.screenshot.filename,
            content: emailData.screenshot.data,
            content_type: emailData.screenshot.contentType,
          },
        ],
      }, { idempotencyKey: `cancel-seller/${emailData.orderId}-${emailData.email}`, userAgent: 'SnapPrint-CancelOrder/1.0' });
    } catch (sellerErr) {
      // B-9: without the seller email the request is lost — tell the buyer.
      console.error('Seller cancellation email failed — returning 502:', sellerErr);
      return jsonError("We couldn't submit your cancellation request right now. Please try again in a few minutes, or email queries@snaprint.in with your order ID.", 502);
    }

    // Space calls ≥500ms apart to stay under Resend's 2 req/s rate limit
    await sleep(500);

    // ── 6. Send buyer confirmation email ──
    try {
      await sendEmailWithRetry(resendApiKey, {
        from: FROM_ORDERS,
        to: emailData.email,
        reply_to: REPLY_TO_QUERIES,
        subject: subjectText(`Cancellation Request Received — ${emailData.orderId}`),
        html: buildBuyerEmail(emailData),
      }, { idempotencyKey: `cancel-buyer/${emailData.orderId}-${emailData.email}`, userAgent: 'SnapPrint-CancelOrder/1.0' });
    } catch (buyerErr) {
      // The seller has the request; a failed confirmation must not make the buyer resubmit.
      console.error('Buyer cancellation confirmation email failed (seller already notified):', buyerErr);
    }

    console.log(`Cancellation request processed: ${emailData.orderId} by ${emailData.name} (${emailData.email})`);

    return jsonResponse({
      success: true,
      message: 'Cancellation request submitted successfully',
    });

  } catch (err) {
    console.error('Cancel order error:', err);
    return jsonError('Something went wrong. Please try again.', 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// Email Templates
// ═══════════════════════════════════════════════════════════════

function buildSellerEmail(data) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;color:#dc2626;">⚠️ Order Cancellation Request</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#888;">A buyer has requested to cancel their order.</p>

      <h3 style="margin:16px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Request Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:160px;">Order ID</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.orderId)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Request Timestamp</td><td style="padding:6px 0;">${escapeHtml(data.istDisplay)} IST</td></tr>
      </table>

      <h3 style="margin:20px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Buyer Information</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:160px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.name)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(data.email)}" style="color:#2563eb;">${escapeHtml(data.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${escapeHtml(data.phone)}</td></tr>
      </table>

      <h3 style="margin:20px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Reason for Cancellation</h3>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(data.reason)}</div>

      <p style="margin-top:20px;font-size:14px;color:#666;">📎 The buyer's order confirmation screenshot is attached to this email.</p>
      <p style="margin-top:8px;font-size:14px;">Reply directly to this email to respond to the buyer at <strong>${escapeHtml(data.email)}</strong>.</p>

      <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">Automated notification from Snap Print</p>
    </div>
  `;
}

function buildBuyerEmail(data) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 16px;">Cancellation Request Received</h2>
      <p>Hi ${escapeHtml(data.name)},</p>
      <p>We've received your request to cancel order <strong>${escapeHtml(data.orderId)}</strong>.</p>

      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;font-size:14px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;width:160px;">Order ID</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(data.orderId)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Requested On</td><td style="padding:4px 0;">${escapeHtml(data.istDisplay)} IST</td></tr>
        </table>
      </div>

      <p>Our team will review your request and get back to you shortly. Please note:</p>
      <ul style="font-size:14px;line-height:1.7;color:#444;">
        <li>Orders can be cancelled for a <strong>full refund only before production begins</strong>.</li>
        <li>Once printing has started, cancellation is no longer possible.</li>
        <li>Approved refunds are processed within <strong>5–7 business days</strong>.</li>
      </ul>

      <p style="margin-top:20px;">If you have any questions, just reply to this email.</p>

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

