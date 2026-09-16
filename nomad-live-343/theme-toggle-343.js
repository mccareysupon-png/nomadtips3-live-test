(() => {
  const KEY = 'nomad343_theme_v1';
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  function normalize(value) {
    return value === 'light' ? 'light' : 'dark';
  }

  function setTheme(value, persist = true) {
    const theme = normalize(value);
    root.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch (_) {}
    }
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f7f4' : '#183d27');
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      const active = button.dataset.themeChoice === theme;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function bind() {
    const initial = normalize(root.dataset.theme || (() => {
      try { return localStorage.getItem(KEY); } catch (_) { return 'dark'; }
    })());
    setTheme(initial, false);

    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.addEventListener('click', () => setTheme(button.dataset.themeChoice));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
