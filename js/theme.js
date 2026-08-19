/* theme.js — light/dark toggle. Runs before <body> paints (loaded in <head>)
   so there's no flash of the wrong theme. Preference is remembered in
   localStorage; falls back to the OS-level prefers-color-scheme. */
(function () {
  const STORAGE_KEY = 'boolean-tool-theme';
  const root = document.documentElement;
  const supportsMedia = typeof window.matchMedia === 'function';
  const media = supportsMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let manual = null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') manual = stored;
  } catch (e) { /* storage unavailable — theme still works, just won't persist */ }

  function systemTheme() { return media && media.matches ? 'dark' : 'light'; }

  function apply(theme) {
    root.dataset.theme = theme;
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isDark = theme === 'dark';
    btn.setAttribute('aria-checked', String(isDark));
    btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function setManual(theme) {
    manual = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    apply(theme);
  }

  function toggle() { setManual(root.dataset.theme === 'dark' ? 'light' : 'dark'); }

  apply(manual || systemTheme());

  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme); // re-sync the button now that it exists in the DOM
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', toggle);
  });

  window.themeController = { toggle, getTheme: () => root.dataset.theme };

  const onSystemChange = e => { if (!manual) apply(e.matches ? 'dark' : 'light'); };
  if (media) {
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }
})();
