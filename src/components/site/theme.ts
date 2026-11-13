const setMode = (dark: boolean) => {
  const root = document.documentElement;
  if (dark) root.dataset.mode = 'dark';
  else delete root.dataset.mode;
  document.dispatchEvent(new CustomEvent('themechange'));
};

// Single owner of the stored mode; the pre-paint script in Base.astro only reads it.
export function toggleTheme(): boolean {
  const dark = document.documentElement.dataset.mode !== 'dark';
  setMode(dark);
  try {
    localStorage.setItem('mode', dark ? 'dark' : 'light');
  } catch {
    // storage blocked: the choice just won't persist
  }
  return dark;
}

/** Until the reader picks a mode, the page tracks the system's as it changes. */
export function followSystem() {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let stored = null;
    try {
      stored = localStorage.getItem('mode');
    } catch {
      // storage blocked: nothing was stored
    }
    if (!stored) setMode(e.matches);
  });
}
