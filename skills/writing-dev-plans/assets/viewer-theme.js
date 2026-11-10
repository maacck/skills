(() => {
  const root = document.documentElement;
  const KEY = 'plan-viewer-theme';
  const media = matchMedia('(prefers-color-scheme: light)');
  const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const preferred = () => saved() || (media.matches ? 'light' : 'dark');

  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelector('[data-theme-toggle]')?.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到暗色主题');
  }

  apply(preferred());
  media.addEventListener('change', () => { if (!saved()) apply(preferred()); });
  addEventListener('storage', event => { if (event.key === KEY) apply(preferred()); });
  addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch {}
      apply(next);
    });
  });
})();
