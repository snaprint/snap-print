/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Account Page
   Auth gate + Profile management + Order history
   ═══════════════════════════════════════════════════════════════ */

import { showToast } from './utils.js';
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
  getBuyerOrders,
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

// Orders
const ordersListEl   = document.getElementById('orders-list');
const ordersLoading  = document.getElementById('orders-loading');

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

  // Load profile
  const profile = await getBuyerProfile(user.uid);
  renderProfileView(user, profile);
  populateProfileForm(user, profile);

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
// PROFILE
// ═══════════════════════════════════════════════════════════

function renderProfileView(user, profile) {
  if (!profileGrid) return;
  const p = profile || {};

  const fields = [
    { label: 'Email', value: user.email || '—' },
    { label: 'Name', value: p.name || '—' },
    { label: 'Phone', value: p.phone || '—' },
    { label: 'Address', value: [p.address, p.apartment].filter(Boolean).join(', ') || '—' },
    { label: 'City', value: p.city || '—' },
    { label: 'State', value: p.state || '—' },
    { label: 'PIN Code', value: p.pincode || '—' },
  ];

  profileGrid.innerHTML = fields.map(f => `
    <div class="profile-field">
      <span class="profile-field__label">${f.label}</span>
      <span class="profile-field__value">${f.value}</span>
    </div>
  `).join('');
}

function populateProfileForm(user, profile) {
  const p = profile || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('profile-name', p.name);
  set('profile-phone', p.phone);
  set('profile-address', p.address);
  set('profile-city', p.city);
  set('profile-state', p.state);
  set('profile-pincode', p.pincode);
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
    name:    document.getElementById('profile-name')?.value.trim() || '',
    phone:   document.getElementById('profile-phone')?.value.trim() || '',
    address: document.getElementById('profile-address')?.value.trim() || '',
    city:    document.getElementById('profile-city')?.value.trim() || '',
    state:   document.getElementById('profile-state')?.value.trim() || '',
    pincode: document.getElementById('profile-pincode')?.value.trim() || '',
    email:   user.email,
  };

  try {
    await saveBuyerProfile(user.uid, data);
    renderProfileView(user, data);
    hideProfileEdit();
    showToast('Profile updated!', 'success');
  } catch (err) {
    showToast('Failed to save profile. Please try again.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════

async function loadOrders(uid) {
  if (ordersLoading) ordersLoading.style.display = 'flex';

  const orders = await getBuyerOrders(uid);

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

    const statusClass = order.status === 'paid' ? 'order-status--paid' : '';

    return `
      <div class="order-card">
        <div class="order-card__header">
          <div>
            <span class="order-card__id">${order.orderId || order.id}</span>
            <span class="order-card__date">${date}</span>
          </div>
          <span class="order-card__total">${total}</span>
        </div>
        <div class="order-card__items">${itemsSummary || 'No items recorded'}</div>
        <div class="order-card__footer">
          <span class="order-status ${statusClass}">${order.status || 'unknown'}</span>
          <a href="/track-order.html?order=${order.orderId || order.id}" class="btn btn-ghost btn-sm">Track Order →</a>
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', init);
