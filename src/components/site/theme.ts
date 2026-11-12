// Single owner of the stored mode; the pre-paint script in Base.astro only reads it.
export function toggleTheme(): boolean {
  const root = document.documentElement;
  const dark = root.dataset.mode !== 'dark';
  if (dark) root.dataset.mode = 'dark';
  else delete root.dataset.mode;
  try {
    localStorage.setItem('mode', dark ? 'dark' : 'light');
  } catch {
    // storage blocked: the choice just won't persist
  }
  document.dispatchEvent(new CustomEvent('themechange'));
  return dark;
}
