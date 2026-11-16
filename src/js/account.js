/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Account Page
   Auth gate + Profile (name/phone) + Multi-address + Order history
   ═══════════════════════════════════════════════════════════════ */

import { showToast, CONFIG, fetchCSV } from './utils.js';
import { escapeHtml } from './helpers.js';
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
  updateBuyerAddress,
  deleteBuyerAddress,
  setDefaultAddress,
  getBuyerOrders,
  MAX_ADDRESSES,
  withTimeout,
} from './firebase.js';

// ── DOM refs ──
const loginGate      = document.getElementById('account-login-gate');
const accountContent = document.getElementById('account-content');
const authGoogleBtn  = document.getElementById('auth-google-btn');
const authTabs       = document.getElementById('auth-tabs');
const signupForm     = document.getElementById('auth-signup-form');
const loginForm      = document.getElementById('auth-login-form');
const authError      = document.getElementById('auth-error');
const authForgotBtn  = document.getElementById('auth-forgot-btn');
const logoutBtn      = document.getElementById('account-logout-btn');

// Profile
const profileGrid      = document.getElementById('profile-grid');
const profileView      = document.getElementById('profile-view');
const profileForm      = document.getElementById('profile-form');
const profileEditBtn   = document.getElementById('profile-edit-btn');
const profileCancelBtn = document.getElementById('profile-cancel-btn');

// Addresses
const addressesListEl  = document.getElementById('addresses-list');
const addressAddBtn    = document.getElementById('address-add-btn');
const addressForm      = document.getElementById('address-form');
const addressCancelBtn = document.getElementById('address-cancel-btn');
const addressCounterEl = document.getElementById('address-counter');

// Orders
const ordersListEl   = document.getElementById('orders-list');
const ordersLoading  = document.getElementById('orders-loading');

// ── State ──
let currentProfile = null;
let profileLoadFailed = false;

const SAVE_FAILED = 'Could not save your changes. Check your connection and try again.';
const SAVE_TIMED_OUT = 'Saving is taking too long. Check your connection, then refresh the page to see whether the change was saved.';
const saveErrorMessage = err => err?.code === 'timeout' ? SAVE_TIMED_OUT
  : err?.message?.includes('no longer exists') ? err.message : SAVE_FAILED;

/** Reload the profile after a successful write; a failed reload is not a failed save. */
async function reloadAddresses(uid) {
  try {
    currentProfile = await getBuyerProfile(uid);
    profileLoadFailed = false;
  } catch (err) {
    console.error('[Account] Reload failed:', err);
    showToast('Saved, but the list could not be refreshed. Refresh the page to see it.', 'info', 6000);
    return;
  }
  renderAddressList(currentProfile);
}

// ── Init ──
function init() {
  initAuthGate();

  onAuthChange(async (user) => {
    if (user) {
      showAccountContent(user);
    } else {
      showLoginGate();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// AUTH GATE (mirrors checkout logic)
// ═══════════════════════════════════════════════════════════

function initAuthGate() {
  authGoogleBtn?.addEventListener('click', handleGoogleSignIn);

  authTabs?.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      authTabs.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'signup') {
        signupForm.style.display = '';
        loginForm.style.display = 'none';
      } else {
        signupForm.style.display = 'none';
        loginForm.style.display = '';
      }
      hideAuthError();
    });
  });

  signupForm?.addEventListener('submit', handleEmailSignUp);
  loginForm?.addEventListener('submit', handleEmailLogin);
  authForgotBtn?.addEventListener('click', handleForgotPassword);
  logoutBtn?.addEventListener('click', handleSignOut);

  // Profile edit/cancel
  profileEditBtn?.addEventListener('click', showProfileEdit);
  profileCancelBtn?.addEventListener('click', hideProfileEdit);
  profileForm?.addEventListener('submit', handleProfileSave);

  // Address add/edit/cancel
  addressAddBtn?.addEventListener('click', showAddressFormForNew);
  addressCancelBtn?.addEventListener('click', hideAddressForm);
  addressForm?.addEventListener('submit', handleAddressSave);
}

async function handleGoogleSignIn() {
  hideAuthError();
  authGoogleBtn.disabled = true;
  try {
    await signInWithGoogle();
  } catch (err) {
    showAuthError(friendlyAuthError(err));
  } finally {
    authGoogleBtn.disabled = false;
  }
}

async function handleEmailSignUp(e) {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  const confirm = document.getElementById('auth-signup-password-confirm').value;

  if (password !== confirm) { showAuthError('Passwords do not match.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  const btn = document.getElementById('auth-signup-btn');
  const btnText = document.getElementById('auth-signup-btn-text');
  btn.disabled = true;
  btnText.textContent = 'Creating account…';
  try {
    await signUpWithEmail(email, password);
  } catch (err) {
    showAuthError(friendlyAuthError(err));
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Create Account';
  }
}

async function handleEmailLogin(e) {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById('auth-login-email').value.trim();
  const password = document.getElementById('auth-login-password').value;

  const btn = document.getElementById('auth-login-btn');
  const btnText = document.getElementById('auth-login-btn-text');
  btn.disabled = true;
  btnText.textContent = 'Logging in…';
  try {
    await signInWithEmail(email, password);
  } catch (err) {
    showAuthError(friendlyAuthError(err));
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Log In';
  }
}

async function handleForgotPassword() {
  hideAuthError();
  const email = document.getElementById('auth-login-email')?.value.trim();
  if (!email) { showAuthError('Enter your email address above, then click "Forgot password?"'); return; }
  try {
    await resetPassword(email);
    showToast('Password reset email sent — check your inbox.', 'success', 5000);
  } catch (err) {
    showAuthError(friendlyAuthError(err));
  }
}

async function handleSignOut() {
  try {
    await signOutUser();
  } catch (err) {
    showToast('Sign out failed. Please try again.', 'error');
  }
}

// ── Show/hide ──
function showLoginGate() {
  if (loginGate) loginGate.style.display = '';
  if (accountContent) accountContent.style.display = 'none';
}

async function showAccountContent(user) {
  if (loginGate) loginGate.style.display = 'none';
  if (accountContent) accountContent.style.display = '';

  // Load profile (F-4: a failed read shows an error instead of an empty profile)
  try {
    currentProfile = await withTimeout(getBuyerProfile(user.uid));
    profileLoadFailed = false;
  } catch (err) {
    console.error('[Account] Failed to load profile:', err);
    currentProfile = null;
    profileLoadFailed = true;
    showToast('Could not load your saved details. Check your connection and refresh the page.', 'error', 8000);
  }
  renderProfileView(user, currentProfile);
  populateProfileForm(user, currentProfile);
  renderAddressList(currentProfile);

  // Load orders
  loadOrders(user.uid);
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
  };
  return map[code] || err?.message || 'Something went wrong. Please try again.';
}

// ═══════════════════════════════════════════════════════════
// PROFILE (name, phone, email only — addresses are separate)
// ═══════════════════════════════════════════════════════════

function renderProfileView(user, profile) {
  if (!profileGrid) return;
  const p = profile || {};

  const fields = [
    { label: 'Email', value: user.email || '—' },
    { label: 'Name', value: p.name || '—' },
    { label: 'Phone', value: p.phone || '—' },
  ];

  profileGrid.innerHTML = fields.map(f => `
    <div class="profile-field">
      <span class="profile-field__label">${f.label}</span>
      <span class="profile-field__value">${escapeHtml(f.value)}</span>
    </div>
  `).join('');
}

function populateProfileForm(user, profile) {
  const p = profile || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('profile-name', p.name);
  set('profile-phone', p.phone);
}

function showProfileEdit() {
  if (profileView) profileView.style.display = 'none';
  if (profileForm) profileForm.style.display = '';
  if (profileEditBtn) profileEditBtn.style.display = 'none';
}

function hideProfileEdit() {
  if (profileView) profileView.style.display = '';
  if (profileForm) profileForm.style.display = 'none';
  if (profileEditBtn) profileEditBtn.style.display = '';
}

async function handleProfileSave(e) {
  e.preventDefault();
  const user = getCurrentUser();
  if (!user) return;

  const data = {
    name:  document.getElementById('profile-name')?.value.trim() || '',
    phone: document.getElementById('profile-phone')?.value.trim() || '',
    email: user.email,
  };

  try {
    await withTimeout(saveBuyerProfile(user.uid, data));
    currentProfile = { ...currentProfile, ...data };
    renderProfileView(user, currentProfile);
    hideProfileEdit();
    showToast('Profile updated!', 'success');
  } catch (err) {
    console.error('[Account] Profile save failed:', err);
    showToast(saveErrorMessage(err), 'error', 8000);
  }
}

// ═══════════════════════════════════════════════════════════
// ADDRESSES
// ═══════════════════════════════════════════════════════════

function renderAddressList(profile) {
  if (profileLoadFailed) {
    addressesListEl.innerHTML = `
      <div class="account-empty">
        <p>Your saved addresses could not be loaded. Please refresh the page.</p>
      </div>
    `;
    if (addressAddBtn) addressAddBtn.style.display = 'none';
    return;
  }
  const addresses = profile?.addresses || [];
  updateAddressCounter(addresses.length);

  if (addresses.length === 0) {
    addressesListEl.innerHTML = `
      <div class="account-empty">
        <p>No saved addresses</p>
      </div>
    `;
    return;
  }

  addressesListEl.innerHTML = addresses.map(addr => {
    const fullAddress = [addr.address, addr.apartment, addr.city, getStateName(addr.state), addr.pincode]
      .filter(Boolean).join(', ');
    const defaultBadge = addr.isDefault
      ? '<span class="address-badge address-badge--default">Default</span>'
      : '';
    const labelText = escapeHtml(addr.label || 'Address');
    const id = escapeHtml(addr.id);

    return `
      <div class="address-card" data-address-id="${id}">
        <div class="address-card__header">
          <span class="address-card__label">${labelText}</span>
          ${defaultBadge}
        </div>
        <p class="address-card__recipient">${escapeHtml(addr.name || '—')}${addr.phone ? ' · ' + escapeHtml(addr.phone) : ''}</p>
        <p class="address-card__text">${escapeHtml(fullAddress)}</p>
        <div class="address-card__actions">
          ${!addr.isDefault ? `<button class="btn btn-ghost btn-xs" data-action="set-default" data-id="${id}">Set Default</button>` : ''}
          <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${id}">Edit</button>
          <button class="btn btn-ghost btn-xs address-card__delete" data-action="delete" data-id="${id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach event listeners
  addressesListEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleAddressAction);
  });
}

function updateAddressCounter(count) {
  if (addressCounterEl) {
    addressCounterEl.textContent = `(${count}/${MAX_ADDRESSES})`;
  }
  // Hide add button if at max
  if (addressAddBtn) {
    addressAddBtn.style.display = count >= MAX_ADDRESSES ? 'none' : '';
  }
}

function getStateName(code) {
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
  return states[code] || code || '';
}

// ── Address form show/hide ──
function showAddressFormForNew() {
  document.getElementById('address-form-id').value = '';
  document.getElementById('address-form-title').textContent = 'Add New Address';
  document.getElementById('address-save-btn').textContent = 'Save Address';
  addressForm.reset();
  addressForm.style.display = '';
  addressForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showAddressFormForEdit(addr) {
  document.getElementById('address-form-id').value = addr.id;
  document.getElementById('address-form-title').textContent = 'Edit Address';
  document.getElementById('address-save-btn').textContent = 'Update Address';
  document.getElementById('address-label').value = addr.label || '';
  document.getElementById('address-name').value = addr.name || '';
  document.getElementById('address-phone').value = addr.phone || '';
  document.getElementById('address-street').value = addr.address || '';
  document.getElementById('address-apartment').value = addr.apartment || '';
  document.getElementById('address-city').value = addr.city || '';
  document.getElementById('address-state').value = addr.state || '';
  document.getElementById('address-pincode').value = addr.pincode || '';
  addressForm.style.display = '';
  addressForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAddressForm() {
  addressForm.style.display = 'none';
  addressForm.reset();
  document.getElementById('address-form-id').value = '';
}

async function handleAddressSave(e) {
  e.preventDefault();
  const user = getCurrentUser();
  if (!user) return;

  const editId = document.getElementById('address-form-id').value;
  const data = {
    label:     document.getElementById('address-label')?.value.trim() || 'Address',
    name:      document.getElementById('address-name')?.value.trim() || '',
    phone:     document.getElementById('address-phone')?.value.trim() || '',
    address:   document.getElementById('address-street')?.value.trim() || '',
    apartment: document.getElementById('address-apartment')?.value.trim() || '',
    city:      document.getElementById('address-city')?.value.trim() || '',
    state:     document.getElementById('address-state')?.value || '',
    pincode:   document.getElementById('address-pincode')?.value.trim() || '',
  };

  if (!data.name || !data.address || !data.city || !data.state || !data.pincode) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const saveBtn = document.getElementById('address-save-btn');
  saveBtn.disabled = true;

  try {
    if (editId) {
      await withTimeout(updateBuyerAddress(user.uid, editId, data));
      showToast('Address updated!', 'success');
    } else {
      const newId = await withTimeout(addBuyerAddress(user.uid, data));
      if (!newId) {
        showToast(`Maximum ${MAX_ADDRESSES} addresses reached.`, 'error');
        saveBtn.disabled = false;
        return;
      }
      showToast('Address saved!', 'success');
    }
    hideAddressForm();
  } catch (err) {
    console.error('[Account] Address save failed:', err);
    showToast(saveErrorMessage(err), 'error', 8000);
    return; // keep the form open with the user's input
  } finally {
    saveBtn.disabled = false;
  }
  await reloadAddresses(user.uid);
}


async function handleAddressAction(e) {
  const action = e.currentTarget.dataset.action;
  const id = e.currentTarget.dataset.id;
  const user = getCurrentUser();
  if (!user || !id) return;

  if (action === 'edit') {
    const addr = currentProfile?.addresses?.find(a => a.id === id);
    if (addr) showAddressFormForEdit(addr);
  } else if (action === 'delete') {
    if (!confirm('Delete this address?')) return;
    try {
      await withTimeout(deleteBuyerAddress(user.uid, id));
    } catch (err) {
      console.error('[Account] Address delete failed:', err);
      showToast('Could not delete the address. Check your connection and try again.', 'error', 6000);
      return;
    }
    showToast('Address deleted.', 'success');
    await reloadAddresses(user.uid);
  } else if (action === 'set-default') {
    try {
      await withTimeout(setDefaultAddress(user.uid, id));
    } catch (err) {
      console.error('[Account] Set default failed:', err);
      showToast('Could not change the default address. Check your connection and try again.', 'error', 6000);
      return;
    }
    showToast('Default address updated.', 'success');
    await reloadAddresses(user.uid);
  }
}

// ═══════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════

async function loadOrders(uid) {
  if (ordersLoading) ordersLoading.style.display = 'flex';

  // Fetch Firestore orders + Google Sheets tracking data in parallel
  let orders, trackingRows;
  try {
    [orders, trackingRows] = await Promise.all([
      withTimeout(getBuyerOrders(uid)),
      fetchTrackingData(),
    ]);
  } catch (err) {
    // F-4: don't claim "No orders yet" when the orders couldn't be read.
    console.error('[Account] Failed to load orders:', err);
    if (ordersLoading) ordersLoading.style.display = 'none';
    ordersListEl.innerHTML = `
      <div class="account-empty">
        <p>Your orders could not be loaded. Check your connection and refresh the page.</p>
      </div>
    `;
    return;
  }

  if (ordersLoading) ordersLoading.style.display = 'none';

  if (!orders || orders.length === 0) {
    ordersListEl.innerHTML = `
      <div class="account-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:40px;height:40px;color:var(--text-muted);margin-bottom:var(--space-3);">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        <p>No orders yet</p>
        <a href="/" class="btn btn-primary btn-sm" style="margin-top:var(--space-3);">Start Shopping</a>
      </div>
    `;
    return;
  }

  // Build a lookup map: order_id → tracking row
  const trackingMap = {};
  for (const row of trackingRows) {
    const id = (row.order_id || '').trim();
    if (id) trackingMap[id] = row;
  }

  ordersListEl.innerHTML = orders.map(order => {
    const date = order.createdAt?.toDate
      ? order.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    const itemsSummary = (order.items || [])
      .map(i => `${i.name} × ${i.quantity}`)
      .join(', ');

    const total = order.total != null
      ? `₹${Number(order.total).toLocaleString('en-IN')}`
      : '—';

    // Match with Google Sheets tracking data by order_id
    const orderId = order.orderId || order.id;
    const tracking = trackingMap[orderId] || null;

    // Determine live status: Sheets > Firestore > default
    const liveStatus = tracking?.order_status?.trim().toLowerCase() || 'processing';
    const trackingLink = tracking?.tracking_link?.trim() || '';

    // Status badge styling
    const statusInfo = getStatusInfo(liveStatus);

    // Track button: only clickable when in_transit AND has a tracking link
    const canTrack = liveStatus === 'in_transit' && trackingLink;
    const trackBtnClass = canTrack ? 'btn btn-ghost btn-sm' : 'btn btn-ghost btn-sm order-track-btn--disabled';
    const trackBtnHref = canTrack ? ensureUrl(trackingLink) : '#';
    const trackBtnTarget = canTrack ? ' target="_blank" rel="noopener noreferrer"' : '';
    const trackBtnClick = canTrack ? '' : ' onclick="return false;"';

    return `
      <div class="order-card">
        <div class="order-card__header">
          <div>
            <span class="order-card__id">${escapeHtml(orderId)}</span>
            <span class="order-card__date">${date}</span>
          </div>
          <span class="order-card__total">${total}</span>
        </div>
        <div class="order-card__items">${escapeHtml(itemsSummary || 'No items recorded')}</div>
        <div class="order-card__footer">
          <span class="order-status ${statusInfo.cssClass}">${escapeHtml(statusInfo.label)}</span>
          <a href="${escapeHtml(trackBtnHref)}" class="${trackBtnClass}"${trackBtnTarget}${trackBtnClick}>${canTrack ? 'Track Order →' : 'Track Order'}</a>
        </div>
      </div>
    `;
  }).join('');

  // Scroll to orders section if URL hash is #orders
  if (window.location.hash === '#orders') {
    document.getElementById('orders-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** Fetch tracking data from Google Sheets (fire-and-forget on error) */
async function fetchTrackingData() {
  if (!CONFIG.ORDER_TRACKING_CSV_URL) return [];
  try {
    return await fetchCSV(CONFIG.ORDER_TRACKING_CSV_URL);
  } catch (err) {
    console.warn('[Account] Failed to fetch tracking data:', err);
    return [];
  }
}

/** Map status codes to display info */
function getStatusInfo(status) {
  const map = {
    processing:  { label: 'Processing',  cssClass: 'order-status--processing' },
    in_transit:  { label: 'In Transit',   cssClass: 'order-status--in-transit' },
    delivered:   { label: 'Delivered',    cssClass: 'order-status--delivered' },
    paid:        { label: 'Paid',         cssClass: 'order-status--paid' },
  };
  return map[status] || { label: status || 'Processing', cssClass: 'order-status--processing' };
}

/** Ensure a string is a valid URL with scheme */
function ensureUrl(url) {
  if (!url) return '#';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '#'; // javascript:, data:, … never become links
  return 'https://' + url;
}

document.addEventListener('DOMContentLoaded', init);
