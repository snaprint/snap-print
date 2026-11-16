/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Turnstile widget (F-20)
   Used by the quote and cancel-order forms. The widget appears only
   when VITE_TURNSTILE_SITE_KEY is set at build time; without it the
   forms work exactly as before (the server only enforces the check
   once TURNSTILE_SECRET_KEY is set, B-6). Tokens are single-use, so
   callers reset() after every response.
   ═══════════════════════════════════════════════════════════════ */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__snapTurnstileReady';

export const turnstileEnabled = Boolean(SITE_KEY);

let scriptPromise = null;
function loadScript() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      window.__snapTurnstileReady = () => resolve(window.turnstile);
      const s = document.createElement('script');
      s.src = SCRIPT_URL;
      s.async = true;
      s.defer = true;
      s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Renders the widget into `container` (an empty element inside the form).
 * @param {HTMLElement|null} container
 * @param {string} action short label shown in Cloudflare analytics ("quote", "cancel")
 * @returns {{ enabled: boolean, getToken: () => string, reset: () => void }}
 */
export function mountTurnstile(container, action) {
  if (!turnstileEnabled || !container) {
    if (container) container.hidden = true;
    return { enabled: false, getToken: () => '', reset() {} };
  }

  let token = '';
  let widgetId = null;
  container.hidden = false;

  loadScript()
    .then(turnstile => {
      widgetId = turnstile.render(container, {
        sitekey: SITE_KEY,
        action,
        theme: 'light',
        callback: t => { token = t; },
        'expired-callback': () => { token = ''; },
        'error-callback': () => { token = ''; },
      });
    })
    .catch(err => {
      console.error('[Turnstile]', err);
      container.textContent = 'The security check could not load. Please disable ad blockers for this site or try again later.';
    });

  return {
    enabled: true,
    getToken: () => token,
    reset() {
      token = '';
      if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    },
  };
}

export const SECURITY_CHECK_MESSAGE = 'Please complete the security check above, then submit again.';
