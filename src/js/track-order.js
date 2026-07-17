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
function normaliseEmail(v)  { return v.trim().toLowerCase(); }
function normaliseMobile(v) { return v.replace(/[\s\-+]/g, '').replace(/^91/, ''); }

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

    if (!match) {
      showError('No order found matching those details. Please check your email and mobile number and try again.');
      return;
    }

    if (!match.tracking_link || !match.tracking_link.trim()) {
      showError(`Hi ${match.customer_name || 'there'}, your order is being prepared and a tracking link will be available soon. Please check back shortly.`);
      return;
    }

    showResult(match);

  } catch (err) {
    console.error('Track order error:', err);
    showToast(err.message || 'Something went wrong. Please try again.', 'error');
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

  if (nameEl)  nameEl.textContent  = row.customer_name ? `Hi ${row.customer_name}!` : 'Order Found!';
  if (linkBtn) {
    linkBtn.href = row.tracking_link.trim();
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
