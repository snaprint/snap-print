/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Seller Login Page JS
   Form validation, API call, token storage, redirect
   ═══════════════════════════════════════════════════════════════ */

const form = document.getElementById('login-form');
const usernameInput = document.getElementById('login-username');
const passwordInput = document.getElementById('login-password');
const submitBtn = document.getElementById('login-submit');
const submitText = document.getElementById('login-submit-text');
const errorBox = document.getElementById('login-error');
const passwordToggle = document.getElementById('password-toggle');

// ── If already logged in, redirect to dashboard ──
function checkExistingSession() {
  const token = sessionStorage.getItem('seller_token');
  if (token) {
    window.location.href = '/seller-dashboard.html';
  }
}

// ── Password visibility toggle ──
function initPasswordToggle() {
  if (!passwordToggle) return;
  passwordToggle.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    // Swap icon
    const eyeIcon = document.getElementById('eye-icon');
    if (eyeIcon) {
      eyeIcon.innerHTML = isPassword
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  });
}

// ── Form submission ──
async function handleLogin(e) {
  e.preventDefault();
  hideError();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username) {
    showError('Please enter your username');
    usernameInput.focus();
    return;
  }
  if (!password) {
    showError('Please enter your password');
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    const response = await fetch('/api/seller-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showError(data.message || 'Invalid credentials. Please try again.');
      setLoading(false);
      return;
    }

    // Store token and username in sessionStorage (cleared on tab close)
    sessionStorage.setItem('seller_token', data.token);
    sessionStorage.setItem('seller_username', data.username);

    // Redirect to dashboard
    window.location.href = '/seller-dashboard.html';

  } catch (err) {
    console.error('Login error:', err);
    showError('Something went wrong. Please try again.');
    setLoading(false);
  }
}

// ── UI helpers ──
function setLoading(on) {
  submitBtn.disabled = on;
  submitText.textContent = on ? 'Signing in…' : 'Sign In';
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('visible');
  // Re-trigger shake animation
  errorBox.style.animation = 'none';
  errorBox.offsetHeight; // force reflow
  errorBox.style.animation = '';
}

function hideError() {
  errorBox.classList.remove('visible');
}

// ── Clear errors on input ──
function initFieldListeners() {
  [usernameInput, passwordInput].forEach(input => {
    if (input) {
      input.addEventListener('input', hideError);
    }
  });
}

// ── Init ──
function init() {
  checkExistingSession();
  initPasswordToggle();
  initFieldListeners();
  if (form) form.addEventListener('submit', handleLogin);
}

document.addEventListener('DOMContentLoaded', init);
