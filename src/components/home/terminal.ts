import type { FeedEntry } from '../../lib/content/schemas';

const POLL_MS = 5_000;
const ROWS = 8;

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

const span = (text: string, cls: string) => {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
};

function renderFeed(list: HTMLElement, entries: FeedEntry[]) {
  const now = Date.now();
  const rows = entries.slice(0, ROWS).map((e) => {
    const li = document.createElement('li');
    const cells = [
      span(e.m, 'm'),
      span(e.p, 'p'),
      span(String(e.s), e.s < 400 ? 's ok' : 's err'),
      span(e.c, e.c === 'HIT' ? 'c hit' : 'c'),
      span(`${e.ms} ms`, 'ms'),
      span(formatAgo(now - e.t), 't'),
    ];
    // Spaces keep copied and screen-read rows legible; the grid ignores them.
    li.append(...cells.flatMap((c) => [c, ' ']).slice(0, -1));
    return li;
  });
  if (rows.length === 0) {
    const idle = document.createElement('li');
    idle.className = 'idle';
    idle.textContent = 'waiting for requests...';
    rows.push(idle);
  }
  list.replaceChildren(...rows);
}

function initCurl(root: HTMLElement) {
  const out = root.querySelector<HTMLElement>('[data-api-out]')!;
  const pills = [...root.querySelectorAll<HTMLButtonElement>('[data-endpoint]')];
  let current = 0;
  for (const pill of pills) {
    pill.addEventListener('click', async () => {
      const id = ++current;
      for (const p of pills) p.setAttribute('aria-pressed', String(p === pill));
      try {
        const res = await fetch(`/api${pill.dataset.endpoint}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (id === current) out.textContent = JSON.stringify(body, null, 2);
      } catch {
        if (id === current) out.textContent = JSON.stringify({ error: 'request failed' }, null, 2);
      }
    });
  }
}

// Polls only while the terminal is on screen and the tab is visible.
function initTail(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>('[data-feed]')!;
  let intersecting = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    try {
      const res = await fetch('/api/requests');
      if (res.ok) renderFeed(list, (await res.json()).entries);
    } catch {
      // Keep the last rows; the next tick retries.
    }
  };
  const update = () => {
    const live = intersecting && document.visibilityState === 'visible';
    if (live && !timer) {
      void poll();
      timer = setInterval(poll, POLL_MS);
    } else if (!live && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    update();
  }).observe(root);
  document.addEventListener('visibilitychange', update);
}

export function initTerminal(root: HTMLElement) {
  initCurl(root);
  initTail(root);
}
