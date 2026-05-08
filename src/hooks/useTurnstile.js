const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let widgetId = null;
let _resolve = null;

function ensureScriptLoaded() {
  if (document.querySelector('script[src*="turnstile"]')) return;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function ensureWidgetMounted() {
  if (widgetId !== null) return;
  const poll = setInterval(() => {
    const container = document.getElementById('turnstile-widget');
    if (!window.turnstile || !container) return;
    clearInterval(poll);
    widgetId = window.turnstile.render('#turnstile-widget', {
      sitekey: SITE_KEY,
      size: 'invisible',
      callback: (token) => {
        if (_resolve) {
          const r = _resolve;
          _resolve = null;
          r(token);
        }
      },
    });
  }, 50);
}

function waitForWidget() {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (widgetId !== null) { clearInterval(check); resolve(); }
    }, 50);
  });
}

async function getToken() {
  await waitForWidget();
  return new Promise((resolve) => {
    _resolve = resolve;
    window.turnstile.reset(widgetId);
    window.turnstile.execute(widgetId);
  });
}

export default function useTurnstile() {
  if (typeof window !== 'undefined') {
    ensureScriptLoaded();
    ensureWidgetMounted();
  }
  return { getToken };
}
