/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Send Shipment Email
   
   POST /api/send-shipment
   
   Authenticated endpoint — requires a valid session token from
   /api/seller-login. Sends a branded "order shipped" notification
   email to the buyer via Resend.
   
   Env vars: RESEND_API_KEY, SELLER_TOKEN_SECRET (optional; falls back to
   RAZORPAY_WEBHOOK_SECRET). Token logic: functions/_lib/seller-auth.js
   ═══════════════════════════════════════════════════════════════ */

import { verifySessionToken } from '../_lib/seller-auth.js';
import { jsonError, jsonResponse } from '../_lib/http.js';
import { sendEmailWithRetry, escapeHtml, subjectText, isValidEmail, FROM_ORDERS, REPLY_TO_QUERIES } from '../_lib/email.js';

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
    // B-13: the link goes into an <a href>; only allow web links (no javascript:, data:, …).
    let cleanTrackingLink = typeof trackingLink === 'string' ? trackingLink.trim() : '';
    // "www.dtdc.in/track…" (no scheme) → assume https://
    if (cleanTrackingLink && !/^[a-z][a-z0-9+.-]*:/i.test(cleanTrackingLink)) {
      cleanTrackingLink = 'https://' + cleanTrackingLink;
    }
    if (cleanTrackingLink && !isHttpUrl(cleanTrackingLink)) {
      return jsonError('Tracking link must be a full web address starting with https:// or http://', 400);
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
      trackingLink: cleanTrackingLink,
      items: Array.isArray(items) ? items : [],
    });

    const subject = subjectText(orderId?.trim()
      ? `Your Order Has Been Shipped! 📦 — ${orderId.trim()}`
      : 'Your Order Has Been Shipped! 📦');

    await sendEmailWithRetry(resendApiKey, {
      from: FROM_ORDERS,
      to: buyerEmail.trim(),
      reply_to: REPLY_TO_QUERIES,
      subject,
      html: emailHtml,
    });

    console.log(`Shipment email sent to ${buyerEmail} by seller "${auth.username}"`);

    return jsonResponse({
      success: true,
      message: `Shipment notification sent to ${buyerEmail}`,
    });

  } catch (err) {
    console.error('Send shipment error:', err);
    return jsonError('Something went wrong. Please try again.', 500);
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

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
