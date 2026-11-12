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

export type ParsedCommand =
  | { type: 'curl'; path: string }
  | { type: 'help' }
  | { type: 'clear' }
  | { type: 'empty' }
  | { type: 'unknown'; raw: string };

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed) return { type: 'empty' };
  if (trimmed === 'help') return { type: 'help' };
  if (trimmed === 'clear') return { type: 'clear' };

  if (trimmed.startsWith('/me') || trimmed.startsWith('/stack') || trimmed.startsWith('/now') || trimmed.startsWith('/requests')) {
    return { type: 'curl', path: `/api${trimmed}` };
  }

  if (trimmed === 'curl') {
    return { type: 'unknown', raw: 'curl' };
  }

  if (trimmed.startsWith('curl ')) {
    let arg = trimmed.slice(5).trim();
    if (!arg) return { type: 'unknown', raw: trimmed };

    if (arg.startsWith('http://') || arg.startsWith('https://')) {
      try {
        arg = new URL(arg).pathname;
      } catch {
        // keep arg as is
      }
    }
    arg = arg.replace(/^juanalmaraz\.dev/, '');

    if (arg.startsWith('/api/')) {
      return { type: 'curl', path: arg };
    }
    if (arg.startsWith('/')) {
      return { type: 'curl', path: `/api${arg}` };
    }
    return { type: 'curl', path: `/api/${arg}` };
  }

  return { type: 'unknown', raw: trimmed };
}

export const CANDIDATES = [
  'curl /api/me',
  'curl /api/stack',
  'curl /api/now',
  'curl /api/requests',
  'help',
  'clear',
];

export function autocomplete(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'curl /api/me';

  const exactIndex = CANDIDATES.indexOf(trimmed);
  if (exactIndex !== -1) {
    const prefix = trimmed.slice(0, trimmed.lastIndexOf('/') + 1);
    const group = prefix ? CANDIDATES.filter((c) => c.startsWith(prefix)) : CANDIDATES;
    if (group.length > 1) {
      const idx = group.indexOf(trimmed);
      return group[(idx + 1) % group.length];
    }
  }

  const matches = CANDIDATES.filter((c) => c.startsWith(trimmed));
  if (matches.length > 0) {
    return matches[0];
  }

  return input;
}

export class CommandHistory {
  private list: string[] = [];
  private pointer: number = -1;
  private draft: string = '';

  push(cmd: string): void {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (this.list.length > 0 && this.list[this.list.length - 1] === trimmed) return;
    this.list.push(trimmed);
    this.pointer = this.list.length;
    this.draft = '';
  }

  prev(currentInput: string): string {
    if (this.list.length === 0) return currentInput;
    if (this.pointer === this.list.length) {
      this.draft = currentInput;
    }
    if (this.pointer > 0) {
      this.pointer--;
    }
    return this.list[this.pointer];
  }

  next(): string {
    if (this.list.length === 0) return this.draft;
    if (this.pointer < this.list.length - 1) {
      this.pointer++;
      return this.list[this.pointer];
    }
    this.pointer = this.list.length;
    return this.draft;
  }

  resetPointer(): void {
    this.pointer = this.list.length;
    this.draft = '';
  }
}

export const HELP_TEXT = `Available commands:
  curl /api/me        Get author bio and profile metadata
  curl /api/stack     Get technology stack details
  curl /api/now       Get current focus and reading
  curl /api/requests  Get latest telemetry request logs
  help                Show this help message
  clear               Clear output pane

Shortcuts:
  Tab                 Autocomplete command
  ↑ / ↓               Navigate command history
  Ctrl+L              Clear output pane
  Ctrl+C              Cancel current input`;

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
      span(e.c, e.c === 'cold' ? 'c hit' : 'c'),
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
  const input = root.querySelector<HTMLInputElement>('[data-cli-input]');
  const form = root.querySelector<HTMLFormElement>('[data-cli-form]');
  const pills = [...root.querySelectorAll<HTMLButtonElement>('[data-endpoint]')];
  const pane = out.closest('.pane');

  const history = new CommandHistory();
  let currentRequestId = 0;

  const updatePills = (path?: string) => {
    for (const p of pills) {
      const match = path ? path.endsWith(p.dataset.endpoint ?? '') : false;
      p.setAttribute('aria-pressed', String(match));
    }
  };

  const execute = async (rawCommand: string) => {
    const parsed = parseCommand(rawCommand);
    if (parsed.type === 'empty') return;

    history.push(rawCommand);

    if (parsed.type === 'clear') {
      out.textContent = '';
      updatePills();
      return;
    }

    if (parsed.type === 'help') {
      out.textContent = HELP_TEXT;
      updatePills();
      return;
    }

    if (parsed.type === 'unknown') {
      out.textContent = `command not found: ${parsed.raw}. Type 'help' for available commands.`;
      updatePills();
      return;
    }

    if (parsed.type === 'curl') {
      const id = ++currentRequestId;
      updatePills(parsed.path);
      try {
        const res = await fetch(parsed.path);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (id === currentRequestId) out.textContent = JSON.stringify(body, null, 2);
      } catch {
        if (id === currentRequestId) out.textContent = JSON.stringify({ error: 'request failed' }, null, 2);
      }
    }
  };

  if (input && form) {
    history.push(input.value || 'curl /api/me');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void execute(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        input.value = autocomplete(input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        input.value = history.prev(input.value);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        input.value = history.next();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        out.textContent = '';
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        input.value = '';
        history.resetPointer();
      }
    });

    pane?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, pre')) return;
      input.focus();
    });
  }

  for (const pill of pills) {
    pill.addEventListener('click', () => {
      const cmd = `curl /api${pill.dataset.endpoint}`;
      if (input) input.value = cmd;
      void execute(cmd);
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

