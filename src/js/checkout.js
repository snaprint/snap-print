/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Checkout
   Firebase Auth gate + split address, PIN auto-fill, shipping,
   Razorpay flow
   ═══════════════════════════════════════════════════════════════ */

import {
  getCart, getCartSubtotal, getCartCount, clearCart,
  formatCurrency, getSampleShippingRates, getShippingCostPreview,
  isValidPhone, showToast, CONFIG, fetchCSV, lookupPIN,
  showPageLoader, hidePageLoader, DELIVERY_DAYS, DELIVERY_PRODUCTION_NOTE,
} from './utils.js';
import { parseBulkPricing, getBulkPrice } from '../../shared/products.js';

import {
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  signOutUser,
  onAuthChange,
  getCurrentUser,
  getBuyerProfile,
  saveBuyerProfile,
  addBuyerAddress,
  saveBuyerOrder,
} from './firebase.js';
import { apiFetch, readApiError, escapeHtml } from './helpers.js';

let selectedAddressId = null; // tracks which saved address is selected

let selectedMethod = '';      // a `method` from the shipping sheet (lower-case)
let shippingCost = 0;
let shippingRates = null;     // F-9: shipping sheet rows, fetched once

// Max time to wait for the post-payment Firestore writes before redirecting.
const POST_PAYMENT_SAVE_TIMEOUT_MS = 4000;

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

// ── Fetch shipping rates from Sheets once per page (or fall back to sample) ──
async function fetchShippingRates() {
  if (shippingRates) return shippingRates;
  let rows;
  if (!CONFIG.SHIPPING_RATES_CSV_URL) {
    rows = getSampleShippingRates();
  } else {
    try {
      rows = await fetchCSV(CONFIG.SHIPPING_RATES_CSV_URL);
    } catch (err) {
      console.warn('[Shipping] Failed to fetch live rates, using fallback:', err);
      showToast('Could not load live shipping rates. Amounts shown may be approximate. The correct cost is confirmed before payment.', 'info', 6000);
      rows = getSampleShippingRates();
    }
  }
  // F-9: one option per distinct method; same normalisation as the server (B-1)
  const seen = new Set();
  shippingRates = rows
    .map(r => ({ ...r, method: String(r.method ?? '').trim().toLowerCase() }))
    .filter(r => r.method && !seen.has(r.method) && seen.add(r.method));
  return shippingRates;
}

function methodLabel(row) {
  return row.field_content?.trim() || row.method.charAt(0).toUpperCase() + row.method.slice(1);
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

  // Pre-fill from Firestore buyer profile
  try {
    const profile = await getBuyerProfile(user.uid);
    if (profile) {
      // Pre-fill name and phone
      const nameEl = document.getElementById('buyer-fullname');
      const phoneEl = document.getElementById('buyer-phone');
      if (nameEl && profile.name) nameEl.value = profile.name;
      if (phoneEl && profile.phone) phoneEl.value = profile.phone;

      // Render address picker if user has saved addresses
      const addresses = profile.addresses || [];
      if (addresses.length > 0) {
        renderAddressPicker(addresses);
      }
    }
  } catch (err) {
    console.warn('[Checkout] Failed to load buyer profile:', err);
    // Non-blocking — buyer can still fill the form manually
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

// ═══════════════════════════════════════════════════════════════
// Address Picker (for logged-in users with saved addresses)
// ═══════════════════════════════════════════════════════════════

function renderAddressPicker(addresses) {
  const section = document.getElementById('address-picker-section');
  const picker = document.getElementById('address-picker');
  if (!section || !picker) return;

  section.style.display = '';

  const states = {
    AN:'Andaman & Nicobar', AP:'Andhra Pradesh', AR:'Arunachal Pradesh', AS:'Assam',
    BR:'Bihar', CH:'Chandigarh', CT:'Chhattisgarh', DN:'Dadra & Nagar Haveli',
    DD:'Daman & Diu', DL:'Delhi', GA:'Goa', GJ:'Gujarat', HR:'Haryana',
    HP:'Himachal Pradesh', JK:'Jammu & Kashmir', JH:'Jharkhand', KA:'Karnataka',
    KL:'Kerala', LA:'Ladakh', LD:'Lakshadweep', MP:'Madhya Pradesh', MH:'Maharashtra',
    MN:'Manipur', ML:'Meghalaya', MZ:'Mizoram', NL:'Nagaland', OR:'Odisha',
    PY:'Puducherry', PB:'Punjab', RJ:'Rajasthan', SK:'Sikkim', TN:'Tamil Nadu',
    TG:'Telangana', TR:'Tripura', UP:'Uttar Pradesh', UT:'Uttarakhand', WB:'West Bengal',
  };

  // Find default address
  const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];

  picker.innerHTML = addresses.map(addr => {
    const fullAddress = [addr.address, addr.apartment, addr.city, states[addr.state] || addr.state, addr.pincode]
      .filter(Boolean).join(', ');
    const isDefault = addr.id === defaultAddr.id;
    return `
      <label class="address-picker__option ${isDefault ? 'selected' : ''}" data-address-id="${escapeHtml(addr.id)}">
        <input type="radio" name="checkout-address" value="${escapeHtml(addr.id)}" ${isDefault ? 'checked' : ''} />
        <div class="address-picker__content">
          <span class="address-picker__label">${escapeHtml(addr.label || 'Address')}${addr.isDefault ? ' <small>(Default)</small>' : ''}</span>
          <span class="address-picker__recipient">${escapeHtml(addr.name || '')}${addr.phone ? ' · ' + escapeHtml(addr.phone) : ''}</span>
          <span class="address-picker__text">${escapeHtml(fullAddress)}</span>
        </div>
      </label>
    `;
  }).join('') + `
    <label class="address-picker__option address-picker__new" data-address-id="new">
      <input type="radio" name="checkout-address" value="new" />
      <div class="address-picker__content">
        <span class="address-picker__label">+ Add New Address</span>
        <span class="address-picker__text">Enter a different delivery address</span>
      </div>
    </label>
  `;

  // Pre-select default address
  selectAddress(defaultAddr);

  // Listen for changes
  picker.querySelectorAll('input[name="checkout-address"]').forEach(radio => {
    radio.addEventListener('change', () => {
      // Update visual selection
      picker.querySelectorAll('.address-picker__option').forEach(opt => opt.classList.remove('selected'));
      radio.closest('.address-picker__option').classList.add('selected');

      if (radio.value === 'new') {
        selectedAddressId = null;
        clearAddressFields();
        setAddressFieldsDisabled(false);
      } else {
        const addr = addresses.find(a => a.id === radio.value);
        if (addr) selectAddress(addr);
      }
    });
  });
}

function selectAddress(addr) {
  selectedAddressId = addr.id;
  const fieldMap = {
    'buyer-fullname':  addr.name || '',
    'buyer-phone':     addr.phone || '',
    'buyer-address':   addr.address || '',
    'buyer-apartment': addr.apartment || '',
    'buyer-city':      addr.city || '',
    'buyer-pincode':   addr.pincode || '',
  };
  for (const [id, value] of Object.entries(fieldMap)) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  const stateSelect = document.getElementById('buyer-state');
  if (stateSelect) stateSelect.value = addr.state || '';
  setAddressFieldsDisabled(true);
}

function clearAddressFields() {
  ['buyer-fullname', 'buyer-phone', 'buyer-address', 'buyer-apartment', 'buyer-city', 'buyer-pincode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const stateSelect = document.getElementById('buyer-state');
  if (stateSelect) stateSelect.value = '';
}

function setAddressFieldsDisabled(disabled) {
  ['buyer-fullname', 'buyer-phone', 'buyer-address', 'buyer-apartment', 'buyer-city', 'buyer-pincode', 'buyer-state'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function clearCheckoutFields() {
  const fieldIds = ['buyer-fullname', 'buyer-address', 'buyer-apartment', 'buyer-city', 'buyer-pincode', 'buyer-phone'];
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
              <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" style="width:100%;height:100%;object-fit:cover;"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2248%22 height=%2248%22/%3E%3C/svg%3E'" />
              <span style="position:absolute;top:-4px;right:-4px;background:var(--text-secondary);color:white;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${item.quantity}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:var(--text-sm);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.name)}</div>
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

  // Keep the buyer's choice if it still exists; default to surface, else the first row
  if (!rates.some(r => r.method === selectedMethod)) {
    selectedMethod = (rates.find(r => r.method === 'surface') || rates[0])?.method || '';
  }
  renderShippingOptions(rates, itemTotal);

  shippingCost = selectedMethod ? getShippingCostPreview(rates, selectedMethod, itemTotal) : 0;

  const summaryShipping = document.getElementById('summary-shipping');
  const summaryTotal    = document.getElementById('summary-total');
  const payBtnText      = document.getElementById('pay-btn-text');

  if (summaryShipping) summaryShipping.textContent = shippingCost === 0 ? 'Free' : formatCurrency(shippingCost);
  if (summaryTotal)    summaryTotal.textContent    = formatCurrency(itemTotal + shippingCost);
  if (payBtnText)      payBtnText.textContent      = `Pay ${formatCurrency(itemTotal + shippingCost)}`;

  renderFreeShippingProgress(rates, itemTotal);
}

// F-9: one radio per row of the shipping sheet
function renderShippingOptions(rates, itemTotal) {
  const selector = document.getElementById('shipping-selector');
  if (!selector) return;
  if (rates.length === 0) {
    selector.innerHTML = '<p class="shipping-option__desc">Shipping options could not be loaded. Please refresh the page.</p>';
    return;
  }
  selector.innerHTML = rates.map(row => {
    const price = getShippingCostPreview(rates, row.method, itemTotal);
    const days = DELIVERY_DAYS[row.method];
    const checked = row.method === selectedMethod;
    return `
      <label class="shipping-option${checked ? ' selected' : ''}">
        <input type="radio" name="shipping" value="${escapeHtml(row.method)}"${checked ? ' checked' : ''} />
        <div class="shipping-option__info">
          <span class="shipping-option__name">${escapeHtml(methodLabel(row))}</span>
          ${days ? `<span class="shipping-option__desc">Est. ${days} (${DELIVERY_PRODUCTION_NOTE})</span>` : ''}
        </div>
        <span class="shipping-option__price">${price === 0 ? 'Free' : formatCurrency(price)}</span>
      </label>`;
  }).join('');
}

// ── Free Shipping Progress Bars ──
const SHIPPING_ICONS = {
  surface: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  air: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
};

function renderFreeShippingProgress(rates, cartTotal) {
  const container = document.getElementById('free-shipping-progress');
  if (!container) return;

  const bars = [];

  for (const row of rates) {
    const method = row.method;

    const threshold = Number(row.item_total);
    if (isNaN(threshold) || threshold <= 0) continue;

    const isFree = cartTotal >= threshold;
    const remaining = Math.max(0, threshold - cartTotal);
    const progress = Math.min(100, (cartTotal / threshold) * 100);
    const label = escapeHtml(method.charAt(0).toUpperCase() + method.slice(1));

    bars.push(`
      <div class="free-shipping-bar ${isFree ? 'free-shipping-bar--complete' : ''}">
        <div class="free-shipping-bar__header">
          <span class="free-shipping-bar__label">
            ${isFree ? SHIPPING_ICONS.check : SHIPPING_ICONS[method] || SHIPPING_ICONS.surface}
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

  // Options are re-rendered from the sheet, so listen on the container
  selector.addEventListener('change', async (e) => {
    const radio = e.target.closest('input[name="shipping"]');
    if (!radio || !radio.checked) return;
    selectedMethod = radio.value;
    await refreshShippingUI();
  });
}

// ═══════════════════════════════════════════════════════════
// PIN CODE LOOKUP
// ═══════════════════════════════════════════════════════════

function initPINLookup() {
  const pinInput = document.getElementById('buyer-pincode');
  const stateSelect = document.getElementById('buyer-state');
  if (!pinInput || !stateSelect) return;

  // F-10: only fill the state when the buyer hasn't chosen one themselves
  // (empty, or the value we filled earlier). Ambiguous PINs fill nothing.
  stateSelect.addEventListener('change', () => { delete stateSelect.dataset.autoFilled; });

  pinInput.addEventListener('input', () => {
    const val = pinInput.value.replace(/\D/g, '');
    pinInput.value = val;
    if (val.length !== 6) return;

    const canFill = !stateSelect.value || stateSelect.dataset.autoFilled === '1';
    if (!canFill) return;
    const result = lookupPIN(val);
    if (result?.state) {
      stateSelect.value = result.state;
      stateSelect.dataset.autoFilled = '1';
      stateSelect.classList.add('has-value');
      stateSelect.closest('.form-group')?.classList.remove('has-error');
    } else if (stateSelect.dataset.autoFilled === '1') {
      // our earlier guess no longer applies
      stateSelect.value = '';
      delete stateSelect.dataset.autoFilled;
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
    if (!selectedMethod) { showToast('Please choose a shipping method', 'error'); return; }

    const buyer = {
      uid:       getCurrentUser()?.uid || '',
      email:     document.getElementById('buyer-email').value.trim(),
      fullName:  document.getElementById('buyer-fullname').value.trim(),
      address:   document.getElementById('buyer-address').value.trim(),
      apartment: document.getElementById('buyer-apartment')?.value.trim() || '',
      city:      document.getElementById('buyer-city').value.trim(),
      state:     document.getElementById('buyer-state').value,
      pincode:   document.getElementById('buyer-pincode').value.trim(),
      phone:     document.getElementById('buyer-phone').value.trim(),
    };

    const items = cart.map(item => ({ id: item.id, quantity: item.quantity }));

    payBtn.disabled = true;
    const payBtnText = document.getElementById('pay-btn-text');
    const originalText = payBtnText.textContent;
    payBtnText.textContent = 'Processing…';
    showPageLoader('Preparing your order…');

    // F-2: no "dev mode" fallback. Any failure keeps the cart and the form
    // as they are and shows the server's message; nothing is ever faked.
    try {
      const response = await apiFetch(`${CONFIG.API_BASE}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, shippingMethod: selectedMethod, buyer }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Could not start the payment. Please try again.'));
      }
      const { order_id, amount, key_id } = await response.json();
      hidePageLoader(); // dismiss before Razorpay modal opens
      openRazorpay(order_id, amount, buyer, key_id);
    } catch (err) {
      console.error('Checkout error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error', 8000);
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
    notes: {},
    theme: { color: '#1a1a1a' },
    async handler(response) {
      // F-3 (first half): the payment is done; the webhook sends the emails.
      // Save the profile / address / order record to Firestore and WAIT for
      // the writes (navigating away aborts in-flight writes), capped so a
      // slow network can't keep the buyer on this page. The client order
      // write stays until the webhook writes it server-side (B-16, F-3b).
      showPageLoader('Payment received. Saving your order…');
      const currentUser = getCurrentUser();
      if (currentUser) {
        const cart = getCart();
        // Store the unit price actually charged (bulk tier), not the base price.
        const items = cart.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: getBulkPrice(parseBulkPricing(item.bulk_pricing), item.quantity, item.price),
          image: item.image || '',
        }));
        const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const total = Number(amount) / 100; // what Razorpay charged (paise → ₹), computed by the server
        const chargedShipping = Math.round((total - subtotal) * 100) / 100;

        const writes = [
          saveBuyerProfile(currentUser.uid, {
            name:  buyer.fullName,
            phone: buyer.phone,
            email: buyer.email,
          }),
          saveBuyerOrder(currentUser.uid, orderId, {
            orderId,
            paymentId: response.razorpay_payment_id || '',
            items,
            subtotal,
            shippingCost: chargedShipping >= 0 ? chargedShipping : shippingCost,
            shippingMethod: selectedMethod,
            total,
            buyerEmail: buyer.email,
            status: 'paid',
          }),
        ];
        // If using a new address (not a saved one), add it to the address book
        if (!selectedAddressId) {
          writes.push(addBuyerAddress(currentUser.uid, {
            label: 'Address',
            name: buyer.fullName,
            phone: buyer.phone,
            address: buyer.address,
            apartment: buyer.apartment,
            city: buyer.city,
            state: buyer.state,
            pincode: buyer.pincode,
          }));
        }

        const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), POST_PAYMENT_SAVE_TIMEOUT_MS));
        const results = await Promise.race([Promise.allSettled(writes), timeout]);
        if (results === 'timeout') {
          console.warn('[Checkout] Post-payment saves did not finish in time; continuing.');
        } else {
          results.filter(r => r.status === 'rejected')
            .forEach(r => console.warn('[Checkout] Post-payment save failed:', r.reason));
        }
      }
      clearCart();
      window.location.href = `/thank-you.html?order=${encodeURIComponent(orderId)}`;
    },
    modal: { ondismiss() { showToast('Payment cancelled', 'info'); } },
  });
  rzp.open();
}

document.addEventListener('DOMContentLoaded', init);
