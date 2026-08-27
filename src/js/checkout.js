/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Checkout
   Firebase Auth gate + split address, PIN auto-fill, shipping,
   Razorpay flow
   ═══════════════════════════════════════════════════════════════ */

import {
  getCart, getCartSubtotal, getCartCount, clearCart,
  formatCurrency, getSampleShippingRates, getShippingCostPreview,
  isValidPhone, showToast, CONFIG, fetchCSV, lookupPIN,
  showPageLoader, hidePageLoader,
  parseBulkPricing, getBulkPrice,
} from './utils.js';

import {
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  signOutUser,
  onAuthChange,
  getCurrentUser,
} from './firebase.js';

let selectedMethod = 'surface';
let shippingCost = 0;

// ── DOM refs (auth gate) ──
const loginGate       = document.getElementById('checkout-login-gate');
const checkoutForm    = document.getElementById('checkout-form');
const authGoogleBtn   = document.getElementById('auth-google-btn');
const authTabs        = document.getElementById('auth-tabs');
const signupForm      = document.getElementById('auth-signup-form');
const loginForm       = document.getElementById('auth-login-form');
const authError       = document.getElementById('auth-error');
const authUserEmail   = document.getElementById('auth-user-email');
const authLogoutBtn   = document.getElementById('auth-logout-btn');
const authForgotBtn   = document.getElementById('auth-forgot-btn');

// ── Fetch shipping rates fresh from Sheets (or fall back to sample) ──
async function fetchShippingRates() {
  if (!CONFIG.SHIPPING_RATES_CSV_URL) return getSampleShippingRates();
  try {
    return await fetchCSV(CONFIG.SHIPPING_RATES_CSV_URL);
  } catch (err) {
    console.warn('[Shipping] Failed to fetch live rates, using fallback:', err);
    showToast('Could not load live shipping rates. Amounts shown may be approximate — the correct cost will be confirmed before payment.', 'info', 6000);
    return getSampleShippingRates();
  }
}

// ── Init ──
async function init() {
  const cart = getCart();
  if (cart.length === 0) { window.location.href = '/cart.html'; return; }

  renderOrderSummary();
  initAuthGate();

  // Auth state drives everything — form init happens after sign-in
  onAuthChange(async (user) => {
    if (user) {
      showCheckoutForm(user);
    } else {
      showLoginGate();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// AUTH GATE LOGIC
// ═══════════════════════════════════════════════════════════

function initAuthGate() {
  // Google Sign-In
  authGoogleBtn?.addEventListener('click', handleGoogleSignIn);

  // Tab switching
  authTabs?.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      authTabs.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (targetTab === 'signup') {
        signupForm.style.display = '';
        loginForm.style.display = 'none';
      } else {
        signupForm.style.display = 'none';
        loginForm.style.display = '';
      }
      hideAuthError();
    });
  });

  // Sign Up form
  signupForm?.addEventListener('submit', handleEmailSignUp);

  // Log In form
  loginForm?.addEventListener('submit', handleEmailLogin);

  // Forgot Password
  authForgotBtn?.addEventListener('click', handleForgotPassword);

  // Sign Out
  authLogoutBtn?.addEventListener('click', handleSignOut);
}

async function handleGoogleSignIn() {
  hideAuthError();
  authGoogleBtn.disabled = true;
  try {
    await signInWithGoogle();
    // onAuthChange will handle the UI switch
  } catch (err) {
    console.error('[Auth] Google sign-in failed:', err);
    showAuthError(friendlyAuthError(err));
  } finally {
    authGoogleBtn.disabled = false;
  }
}

async function handleEmailSignUp(e) {
  e.preventDefault();
  hideAuthError();

  const email    = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  const confirm  = document.getElementById('auth-signup-password-confirm').value;

  if (password !== confirm) {
    showAuthError('Passwords do not match.');
    return;
  }

  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }

  const btn = document.getElementById('auth-signup-btn');
  const btnText = document.getElementById('auth-signup-btn-text');
  btn.disabled = true;
  btnText.textContent = 'Creating account…';

  try {
    await signUpWithEmail(email, password);
    // onAuthChange handles UI
  } catch (err) {
    console.error('[Auth] Email signup failed:', err);
    showAuthError(friendlyAuthError(err));
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Create Account';
  }
}

async function handleEmailLogin(e) {
  e.preventDefault();
  hideAuthError();

  const email    = document.getElementById('auth-login-email').value.trim();
  const password = document.getElementById('auth-login-password').value;

  const btn = document.getElementById('auth-login-btn');
  const btnText = document.getElementById('auth-login-btn-text');
  btn.disabled = true;
  btnText.textContent = 'Logging in…';

  try {
    await signInWithEmail(email, password);
    // onAuthChange handles UI
  } catch (err) {
    console.error('[Auth] Email login failed:', err);
    showAuthError(friendlyAuthError(err));
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Log In';
  }
}

async function handleForgotPassword() {
  hideAuthError();
  const email = document.getElementById('auth-login-email')?.value.trim();
  if (!email) {
    showAuthError('Enter your email address above, then click "Forgot password?"');
    return;
  }

  try {
    await resetPassword(email);
    showToast('Password reset email sent — check your inbox.', 'success', 5000);
  } catch (err) {
    console.error('[Auth] Password reset failed:', err);
    showAuthError(friendlyAuthError(err));
  }
}

async function handleSignOut() {
  try {
    await signOutUser();
    clearCheckoutFields();
    // onAuthChange handles UI
  } catch (err) {
    console.error('[Auth] Sign-out failed:', err);
    showToast('Sign out failed. Please try again.', 'error');
  }
}

// ── Show / hide auth gate vs checkout form ──
function showLoginGate() {
  if (loginGate)    loginGate.style.display = '';
  if (checkoutForm) checkoutForm.style.display = 'none';
}

async function showCheckoutForm(user) {
  if (loginGate)    loginGate.style.display = 'none';
  if (checkoutForm) checkoutForm.style.display = '';

  // Set email from Firebase Auth (read-only)
  const emailInput = document.getElementById('buyer-email');
  if (emailInput && user.email) {
    emailInput.value = user.email;
  }

  // Show user email in status bar
  if (authUserEmail) {
    authUserEmail.textContent = user.email || 'Signed in';
  }

  // Init the rest of the checkout form (once)
  if (!checkoutForm._initialized) {
    checkoutForm._initialized = true;
    initShippingSelector();
    initPINLookup();
    initFormValidation();
    initPayButton();
    await refreshShippingUI();
  }
}

function clearCheckoutFields() {
  const fieldIds = ['buyer-fullname', 'buyer-address', 'buyer-apartment', 'buyer-city', 'buyer-pincode', 'buyer-phone', 'buyer-maps-link'];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const stateSelect = document.getElementById('buyer-state');
  if (stateSelect) stateSelect.value = '';
}

// ── Auth error helpers ──
function showAuthError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  authError.classList.add('visible');
}

function hideAuthError() {
  if (!authError) return;
  authError.classList.remove('visible');
}

/** Map Firebase error codes to user-friendly messages */
function friendlyAuthError(err) {
  const code = err?.code || '';
  const map = {
    'auth/email-already-in-use':    'This email is already registered. Try logging in instead.',
    'auth/invalid-email':           'Please enter a valid email address.',
    'auth/user-not-found':          'No account found with this email.',
    'auth/wrong-password':          'Incorrect password. Try again or reset your password.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/weak-password':           'Password must be at least 6 characters.',
    'auth/too-many-requests':       'Too many attempts. Please wait a moment and try again.',
    'auth/popup-closed-by-user':    'Sign-in popup was closed. Please try again.',
    'auth/popup-blocked':           'Sign-in popup was blocked. Please allow popups for this site.',
    'auth/network-request-failed':  'Network error. Please check your connection.',
    'auth/user-disabled':           'This account has been disabled. Contact support.',
  };
  return map[code] || err?.message || 'Something went wrong. Please try again.';
}

// ═══════════════════════════════════════════════════════════
// ORDER SUMMARY
// ═══════════════════════════════════════════════════════════

function renderOrderSummary() {
  const container = document.getElementById('order-summary');
  if (!container) return;

  const cart = getCart();
  const subtotal = getCartSubtotal();

  container.innerHTML = `
    <div class="summary-card" style="position:sticky;top:calc(var(--navbar-height) + var(--space-4));">
      <h2 class="summary-card__title">Order Summary</h2>

      <div class="flex flex-col gap-3" style="margin-bottom:var(--space-4);">
        ${cart.map(item => {
          const tiers = parseBulkPricing(item.bulk_pricing);
          const effectivePrice = getBulkPrice(tiers, item.quantity, item.price);
          const lineTotal = effectivePrice * item.quantity;
          return `
          <div class="flex items-center gap-3">
            <div style="width:48px;height:48px;border-radius:var(--radius-md);overflow:hidden;background:var(--bg-muted);flex-shrink:0;position:relative;">
              <img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2248%22 height=%2248%22/%3E%3C/svg%3E'" />
              <span style="position:absolute;top:-4px;right:-4px;background:var(--text-secondary);color:white;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${item.quantity}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:var(--text-sm);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
            </div>
            <span style="font-size:var(--text-sm);font-weight:600;white-space:nowrap;">${formatCurrency(lineTotal)}</span>
          </div>`;
        }).join('')}
      </div>

      <div class="divider"></div>

      <div class="summary-card__row">
        <span class="summary-card__label">Subtotal</span>
        <span class="summary-card__value">${formatCurrency(subtotal)}</span>
      </div>
      <div class="summary-card__row">
        <span class="summary-card__label">Shipping</span>
        <span class="summary-card__value" id="summary-shipping">${formatCurrency(shippingCost)}</span>
      </div>
      <div class="summary-card__row summary-card__row--total">
        <span class="summary-card__label">Total</span>
        <span class="summary-card__value" id="summary-total">${formatCurrency(subtotal + shippingCost)}</span>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// SHIPPING
// ═══════════════════════════════════════════════════════════

async function refreshShippingUI() {
  const rates = await fetchShippingRates();
  const itemTotal = getCartSubtotal();

  const surfacePrice = getShippingCostPreview(rates, 'surface', itemTotal);
  const airPrice     = getShippingCostPreview(rates, 'air',     itemTotal);

  const surfaceEl = document.getElementById('shipping-surface-price');
  const airEl     = document.getElementById('shipping-air-price');
  if (surfaceEl) surfaceEl.textContent = surfacePrice === 0 ? 'Free' : formatCurrency(surfacePrice);
  if (airEl)     airEl.textContent     = airPrice     === 0 ? 'Free' : formatCurrency(airPrice);

  shippingCost = getShippingCostPreview(rates, selectedMethod, itemTotal);

  const summaryShipping = document.getElementById('summary-shipping');
  const summaryTotal    = document.getElementById('summary-total');
  const payBtnText      = document.getElementById('pay-btn-text');

  if (summaryShipping) summaryShipping.textContent = shippingCost === 0 ? 'Free' : formatCurrency(shippingCost);
  if (summaryTotal)    summaryTotal.textContent    = formatCurrency(itemTotal + shippingCost);
  if (payBtnText)      payBtnText.textContent      = `Pay ${formatCurrency(itemTotal + shippingCost)}`;

  // ── Free Shipping Progress Bars ──
  renderFreeShippingProgress(rates, itemTotal);
}

// ── Free Shipping Progress Bars ──
const SHIPPING_ICONS = {
  surface: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  air: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
};

const SHIPPING_LABELS = {
  surface: 'Surface',
  air: 'Air',
};

function renderFreeShippingProgress(rates, cartTotal) {
  const container = document.getElementById('free-shipping-progress');
  if (!container) return;

  const methods = ['surface', 'air'];
  const bars = [];

  for (const method of methods) {
    const row = rates.find(r => r.method?.trim().toLowerCase() === method);
    if (!row) continue;

    const threshold = Number(row.item_total);
    if (isNaN(threshold) || threshold <= 0) continue;

    const isFree = cartTotal >= threshold;
    const remaining = Math.max(0, threshold - cartTotal);
    const progress = Math.min(100, (cartTotal / threshold) * 100);
    const label = SHIPPING_LABELS[method] || method;

    bars.push(`
      <div class="free-shipping-bar ${isFree ? 'free-shipping-bar--complete' : ''}">
        <div class="free-shipping-bar__header">
          <span class="free-shipping-bar__label">
            ${isFree ? SHIPPING_ICONS.check : SHIPPING_ICONS[method] || ''}
            ${isFree ? `Free ${label} shipping!` : `${label}`}
          </span>
          <span class="free-shipping-bar__remaining">
            ${isFree ? '✓ Unlocked' : `Add ${formatCurrency(remaining)} more`}
          </span>
        </div>
        <div class="free-shipping-bar__track">
          <div class="free-shipping-bar__fill" style="width: ${progress}%"></div>
        </div>
      </div>
    `);
  }

  if (bars.length > 0) {
    container.innerHTML = `<div class="free-shipping-progress">${bars.join('')}</div>`;
  } else {
    container.innerHTML = '';
  }
}

// ── Shipping Selector ──
function initShippingSelector() {
  const selector = document.getElementById('shipping-selector');
  if (!selector) return;

  selector.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      selectedMethod = radio.value;
      selector.querySelectorAll('.shipping-option').forEach(o => o.classList.remove('selected'));
      radio.closest('.shipping-option')?.classList.add('selected');
      await refreshShippingUI();
    });
  });
}

// ═══════════════════════════════════════════════════════════
// PIN CODE LOOKUP
// ═══════════════════════════════════════════════════════════

function initPINLookup() {
  const pinInput = document.getElementById('buyer-pincode');
  const stateSelect = document.getElementById('buyer-state');
  if (!pinInput || !stateSelect) return;

  pinInput.addEventListener('input', () => {
    const val = pinInput.value.replace(/\D/g, '');
    pinInput.value = val;

    if (val.length === 6) {
      const result = lookupPIN(val);
      if (result && result.state) {
        stateSelect.value = result.state;
        stateSelect.classList.add('has-value');
        stateSelect.closest('.form-group')?.classList.remove('has-error');
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// FORM VALIDATION (confirm fields removed)
// ═══════════════════════════════════════════════════════════

const FIELDS = [
  { id: 'buyer-fullname',      validate: v => v.trim().length >= 1 },
  { id: 'buyer-address',       validate: v => v.trim().length >= 5 },
  { id: 'buyer-city',          validate: v => v.trim().length >= 2 },
  { id: 'buyer-state',         validate: v => v.trim().length >= 1 },
  { id: 'buyer-pincode',       validate: v => /^\d{6}$/.test(v.trim()) },
  { id: 'buyer-phone',         validate: isValidPhone },
];

function initFormValidation() {
  FIELDS.forEach(({ id }) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', () => validateField(id));
    input.addEventListener('input', () => {
      const group = input.closest('.form-group');
      if (group?.classList.contains('has-error')) validateField(id);
    });
  });
}

function validateField(id) {
  const field = FIELDS.find(f => f.id === id);
  if (!field) return true;
  const input = document.getElementById(id);
  const group = input?.closest('.form-group');
  if (!input || !group) return true;
  const isValid = field.validate(input.value);
  group.classList.toggle('has-error', !isValid);
  return isValid;
}

function validateAllFields() {
  let allValid = true;
  FIELDS.forEach(({ id }) => { if (!validateField(id)) allValid = false; });
  return allValid;
}

// ═══════════════════════════════════════════════════════════
// PAY BUTTON + RAZORPAY
// ═══════════════════════════════════════════════════════════

function initPayButton() {
  const payBtn = document.getElementById('pay-btn');
  if (!payBtn) return;

  payBtn.addEventListener('click', async () => {
    if (!validateAllFields()) {
      showToast('Please fill in all required fields', 'error');
      document.querySelector('.form-group.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const cart = getCart();
    if (cart.length === 0) { showToast('Your cart is empty', 'error'); return; }

    const buyer = {
      email:     document.getElementById('buyer-email').value.trim(),
      fullName:  document.getElementById('buyer-fullname').value.trim(),
      address:   document.getElementById('buyer-address').value.trim(),
      apartment: document.getElementById('buyer-apartment')?.value.trim() || '',
      city:      document.getElementById('buyer-city').value.trim(),
      state:     document.getElementById('buyer-state').value,
      pincode:   document.getElementById('buyer-pincode').value.trim(),
      phone:     document.getElementById('buyer-phone').value.trim(),
      mapsLink:  document.getElementById('buyer-maps-link')?.value.trim() || '',
    };

    const items = cart.map(item => ({ id: item.id, quantity: item.quantity }));

    payBtn.disabled = true;
    const payBtnText = document.getElementById('pay-btn-text');
    const originalText = payBtnText.textContent;
    payBtnText.textContent = 'Processing…';
    showPageLoader('Preparing your order…');

    try {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, shippingMethod: selectedMethod, buyer }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to create order');
        }
        const { order_id, amount, key_id } = await response.json();
        hidePageLoader(); // dismiss before Razorpay modal opens
        openRazorpay(order_id, amount, buyer, key_id);
      } catch (fetchErr) {
        // If API is unreachable (dev without backend), simulate
        if (fetchErr instanceof TypeError && fetchErr.message.includes('fetch')) {
          console.log('Dev mode: simulating checkout');
          await new Promise(r => setTimeout(r, 1500));
          hidePageLoader();
          showToast('Dev mode — redirecting to confirmation', 'info');
          clearCart();
          setTimeout(() => { window.location.href = '/thank-you.html?order=DEV-' + Date.now(); }, 500);
        } else {
          throw fetchErr;
        }
      }
    } catch (err) {
      console.error('Checkout error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      hidePageLoader();
      payBtn.disabled = false;
      payBtnText.textContent = originalText;
    }
  });
}

function openRazorpay(orderId, amount, buyer, keyId) {
  // Use key_id from API response, fallback to env var
  const razorpayKey = keyId || CONFIG.RAZORPAY_KEY_ID;
  if (!razorpayKey) {
    showToast('Payment gateway not configured', 'error');
    return;
  }

  // Ensure Razorpay SDK is loaded
  if (!window.Razorpay) {
    showToast('Payment SDK is loading, please try again', 'info');
    return;
  }

  const rzp = new window.Razorpay({
    key: razorpayKey,
    amount,
    currency: 'INR',
    name: 'Snap Print',
    description: 'Order Payment',
    order_id: orderId,
    prefill: {
      name: buyer.fullName,
      email: buyer.email,
      contact: buyer.phone,
    },
    notes: {
      maps_link: buyer.mapsLink || '',
    },
    theme: { color: '#1a1a1a' },
    handler() {
      clearCart();
      window.location.href = `/thank-you.html?order=${orderId}`;
    },
    modal: { ondismiss() { showToast('Payment cancelled', 'info'); } },
  });
  rzp.open();
}

document.addEventListener('DOMContentLoaded', init);
