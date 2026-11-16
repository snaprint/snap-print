/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Buyer sign-in gate (checkout + account)
   One copy of the Google / email sign-up / log-in / forgot-password
   handlers (F-16). Both pages use the same element ids:
   #auth-google-btn, #auth-tabs (.auth-tab[data-tab]), #auth-signup-form,
   #auth-login-form, #auth-error, #auth-forgot-btn and the button ids
   #auth-signup-btn(-text), #auth-login-btn(-text).
   Imports firebase.js, so only checkout.js / account.js may import it.
   ═══════════════════════════════════════════════════════════════ */

import { showToast } from './utils.js';
import {
  signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, signOutUser,
} from './firebase.js';

const $ = id => document.getElementById(id);

/** Map Firebase error codes to user-friendly messages */
export function friendlyAuthError(err) {
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

export function showAuthError(msg) {
  const el = $('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

export function hideAuthError() {
  $('auth-error')?.classList.remove('visible');
}

/** Runs `action` with a button disabled and a busy label, restoring both after. */
async function withBusyButton(btnId, busyText, idleText, action) {
  const btn = $(btnId);
  const text = $(`${btnId}-text`);
  if (btn) btn.disabled = true;
  if (text) text.textContent = busyText;
  try {
    await action();
  } finally {
    if (btn) btn.disabled = false;
    if (text) text.textContent = idleText;
  }
}

/**
 * Wires up the sign-in gate. The page reacts to sign-in/out through
 * firebase.js onAuthChange; this only handles the forms.
 * @param {object} [opts]
 * @param {HTMLElement|null} [opts.signOutButton] button that signs the user out
 * @param {() => void} [opts.onSignedOut] called after a successful sign-out
 */
export function initAuthGate({ signOutButton = null, onSignedOut } = {}) {
  const googleBtn = $('auth-google-btn');
  const tabs = $('auth-tabs');
  const signupForm = $('auth-signup-form');
  const loginForm = $('auth-login-form');

  googleBtn?.addEventListener('click', async () => {
    hideAuthError();
    googleBtn.disabled = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[Auth] Google sign-in failed:', err);
      showAuthError(friendlyAuthError(err));
    } finally {
      googleBtn.disabled = false;
    }
  });

  tabs?.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const signup = tab.dataset.tab === 'signup';
      if (signupForm) signupForm.style.display = signup ? '' : 'none';
      if (loginForm) loginForm.style.display = signup ? 'none' : '';
      hideAuthError();
    });
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const email = $('auth-signup-email').value.trim();
    const password = $('auth-signup-password').value;
    const confirm = $('auth-signup-password-confirm').value;
    if (password !== confirm) { showAuthError('Passwords do not match.'); return; }
    if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
    await withBusyButton('auth-signup-btn', 'Creating account…', 'Create Account', async () => {
      try {
        await signUpWithEmail(email, password);
      } catch (err) {
        console.error('[Auth] Email signup failed:', err);
        showAuthError(friendlyAuthError(err));
      }
    });
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const email = $('auth-login-email').value.trim();
    const password = $('auth-login-password').value;
    await withBusyButton('auth-login-btn', 'Logging in…', 'Log In', async () => {
      try {
        await signInWithEmail(email, password);
      } catch (err) {
        console.error('[Auth] Email login failed:', err);
        showAuthError(friendlyAuthError(err));
      }
    });
  });

  $('auth-forgot-btn')?.addEventListener('click', async () => {
    hideAuthError();
    const email = $('auth-login-email')?.value.trim();
    if (!email) {
      showAuthError('Enter your email address above, then click "Forgot password?"');
      return;
    }
    try {
      await resetPassword(email);
      showToast('Password reset email sent. Check your inbox.', 'success', 5000);
    } catch (err) {
      console.error('[Auth] Password reset failed:', err);
      showAuthError(friendlyAuthError(err));
    }
  });

  signOutButton?.addEventListener('click', async () => {
    try {
      await signOutUser();
      onSignedOut?.();
    } catch (err) {
      console.error('[Auth] Sign-out failed:', err);
      showToast('Sign out failed. Please try again.', 'error');
    }
  });
}
