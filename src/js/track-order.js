/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Track Order
   Fetches the order_tracking Google Sheet CSV each time a lookup
   is requested, matches customer_email + mobile, and returns the
   corresponding tracking link. No values are hardcoded.
   ═══════════════════════════════════════════════════════════════ */

import { CONFIG, fetchCSV, showToast, updateCartBadge } from './utils.js';

// ── DOM refs ──
const form        = document.getElementById('track-form');
const emailInput  = document.getElementById('track-email');
const mobileInput = document.getElementById('track-mobile');
const submitBtn   = document.getElementById('track-submit');
const submitText  = document.getElementById('track-submit-text');
const resultBox   = document.getElementById('track-result');
const errorBox    = document.getElementById('track-error');

// ── Normalise helpers ──
function normaliseEmail(v) { return v.trim().toLowerCase(); }

/**
 * Strips every possible prefix/format a browser or user might enter:
 *   +91 98765 43210  →  9876543210
 *   0091-9876543210  →  9876543210
 *   09876543210      →  9876543210   (leading STD 0)
 *   919876543210     →  9876543210
 *   9876543210       →  9876543210   (already clean)
 */
function normaliseMobile(v) {
  // Remove spaces, dashes, and the literal '+' sign
  let n = v.replace(/[\s\-+]/g, '');
  // Strip international prefix: 0091 or 91 (only if result would be 10 digits)
  if (/^0091/.test(n))  n = n.slice(4);
  else if (/^91/.test(n) && n.length === 12) n = n.slice(2);
  // Strip leading STD zero: 0XXXXXXXXXX → XXXXXXXXXX
  if (/^0/.test(n) && n.length === 11) n = n.slice(1);
  return n;
}

// ── Main lookup ──
async function handleTrack(e) {
  e.preventDefault();

  const email  = normaliseEmail(emailInput.value);
  const mobile = normaliseMobile(mobileInput.value);

  // Basic validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    markError(emailInput, 'track-email-error'); return;
  }
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    markError(mobileInput, 'track-mobile-error'); return;
  }

  // Show loading state
  setLoading(true);
  hideResult();
  hideError();

  try {
    if (!CONFIG.ORDER_TRACKING_CSV_URL) {
      throw new Error('Order tracking is not configured yet. Please contact support.');
    }

    // Always fetch fresh — no cache — so adding a row to the sheet
    // is reflected immediately without redeploying the website.
    const rows = await fetchCSV(CONFIG.ORDER_TRACKING_CSV_URL);

    const match = rows.find(row => {
      const rowEmail  = normaliseEmail(row.customer_email  || '');
      const rowMobile = normaliseMobile(row.mobile         || '');
      return rowEmail === email && rowMobile === mobile;
    });

    // Single output for all non-success cases — covers no match AND link not ready yet
    if (!match || !match.tracking_link || !match.tracking_link.trim()) {
      showError('The details you entered do not match our records. Please check your email and mobile number and try again.');
      return;
    }

    showResult(match);

  } catch (err) {
    console.error('Track order error:', err);
    showError('Something went wrong while looking up your order. Please try again in a moment.');
  } finally {
    setLoading(false);
  }
}

// ── UI helpers ──
function setLoading(on) {
  submitBtn.disabled = on;
  submitText.textContent = on ? 'Searching…' : 'Track My Order';

  const hamsterEl = document.getElementById('track-loader');
  if (hamsterEl) hamsterEl.style.display = on ? 'flex' : 'none';
}

function showResult(row) {
  const nameEl    = document.getElementById('result-name');
  const linkBtn   = document.getElementById('result-link');

  if (nameEl) nameEl.textContent = row.customer_name ? `Hi ${row.customer_name}!` : 'Order Found!';

  if (linkBtn) {
    // Ensure the raw string from the sheet is always a full URL before opening.
    // If someone stored "shiprocket.com/track/..." without a scheme, this fixes it.
    let url = row.tracking_link.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

    // Use onclick + window.open so the sheet value is opened in a new tab
    // regardless of whether it's a full URL, a bare domain, or any other format.
    linkBtn.onclick = (e) => {
      e.preventDefault();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };
  }

  resultBox.style.display = 'block';
  resultBox.classList.add('animate-fade-in-up');
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult() {
  resultBox.style.display = 'none';
  resultBox.classList.remove('animate-fade-in-up');
}

function showError(msg) {
  const msgEl = document.getElementById('track-error-msg');
  if (msgEl) msgEl.textContent = msg;
  errorBox.style.display = 'block';
  errorBox.classList.add('animate-fade-in-up');
}

function hideError() {
  errorBox.style.display = 'none';
  errorBox.classList.remove('animate-fade-in-up');
}

function markError(input, errorId) {
  input.closest('.form-group')?.classList.add('has-error');
  input.focus();
}

// ── Clear errors on input ──
function initFieldValidation() {
  [emailInput, mobileInput].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => {
      input.closest('.form-group')?.classList.remove('has-error');
      hideError();
    });
    // Numeric-only for mobile
    if (input === mobileInput) {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^\d\s+\-]/g, '');
      });
    }
  });
}

// ── Init ──
function init() {
  updateCartBadge();
  if (form) form.addEventListener('submit', handleTrack);
  initFieldValidation();
  setLoading(false);

  // Hamburger menu
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
      mobileMenu.classList.toggle('open', open);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
