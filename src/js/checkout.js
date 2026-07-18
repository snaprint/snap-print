/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Checkout
   Split address, PIN auto-fill, shipping, Razorpay flow
   ═══════════════════════════════════════════════════════════════ */

import {
  getCart, getCartSubtotal, getCartCount, clearCart,
  formatCurrency, getSampleShippingRates, getShippingCostPreview,
  isValidEmail, isValidPhone, showToast, CONFIG, fetchCSV, lookupPIN,
  showPageLoader, hidePageLoader,
} from './utils.js';

let selectedMethod = 'surface';
let shippingCost = 0;

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
  initShippingSelector();
  initPINLookup();
  initFormValidation();
  initPayButton();
  await refreshShippingUI();
}

// ── Order Summary ──
function renderOrderSummary() {
  const container = document.getElementById('order-summary');
  if (!container) return;

  const cart = getCart();
  const subtotal = getCartSubtotal();

  container.innerHTML = `
    <div class="summary-card" style="position:sticky;top:calc(var(--navbar-height) + var(--space-4));">
      <h2 class="summary-card__title">Order Summary</h2>

      <div class="flex flex-col gap-3" style="margin-bottom:var(--space-4);">
        ${cart.map(item => `
          <div class="flex items-center gap-3">
            <div style="width:48px;height:48px;border-radius:var(--radius-md);overflow:hidden;background:var(--bg-muted);flex-shrink:0;position:relative;">
              <img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2248%22 height=%2248%22/%3E%3C/svg%3E'" />
              <span style="position:absolute;top:-4px;right:-4px;background:var(--text-secondary);color:white;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${item.quantity}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:var(--text-sm);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
            </div>
            <span style="font-size:var(--text-sm);font-weight:600;white-space:nowrap;">${formatCurrency(item.price * item.quantity)}</span>
          </div>
        `).join('')}
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

// ── Shipping Prices ──
// Fetches fresh rates from Sheets, updates the UI, and stores current shippingCost.
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
}

// ── Shipping Selector ──
function initShippingSelector() {
  const selector = document.getElementById('shipping-selector');
  if (!selector) return;

  // Listen on the radio <input> directly instead of the parent <label>.
  // On iOS Safari, clicking a <label> fires the click event TWICE (once for
  // the label, once auto-forwarded to the inner input), which caused
  // refreshShippingUI() to race against itself on mobile.
  // The `change` event fires exactly once when the selection actually changes.
  selector.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return; // guard: only act on the newly-selected input
      selectedMethod = radio.value;
      selector.querySelectorAll('.shipping-option').forEach(o => o.classList.remove('selected'));
      radio.closest('.shipping-option')?.classList.add('selected');
      // Re-fetch from Sheets every time a method is chosen
      await refreshShippingUI();
    });
  });
}

// ── PIN Code → Auto-fill City/State ──
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

// ── Form Validation ──
const FIELDS = [
  { id: 'buyer-email',         validate: isValidEmail },
  { id: 'buyer-email-confirm', validate: v => v.trim() === document.getElementById('buyer-email')?.value.trim() && v.trim().length > 0 },
  { id: 'buyer-fullname',      validate: v => v.trim().length >= 1 },
  { id: 'buyer-address',       validate: v => v.trim().length >= 5 },
  { id: 'buyer-city',          validate: v => v.trim().length >= 2 },
  { id: 'buyer-state',         validate: v => v.trim().length >= 1 },
  { id: 'buyer-pincode',       validate: v => /^\d{6}$/.test(v.trim()) },
  { id: 'buyer-phone',         validate: isValidPhone },
  { id: 'buyer-phone-confirm', validate: v => v.trim() === document.getElementById('buyer-phone')?.value.trim() && v.trim().length > 0 },
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

// ── Pay Button ──
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
