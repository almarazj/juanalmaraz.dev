import { bannerHTML, candidates, type Candidate, type Env, promptHTML, run, SUGGESTIONS, toHTML, type Result } from './commands';
import type { TerminalData } from './data';
import { commonPrefix, completionTarget, type HistoryCursor, searchHistory, stepHistory, suggest } from './editor';
import { esc, span } from './html';
import { localTime, neofetchHTML } from './neofetch';
import { frame, REST_ANGLE } from './spinner';

const HISTORY_KEY = 'terminal-history';
const HISTORY_MAX = 300;
const SCROLLBACK = 600;
const FRAME_MS = 66;
// Shown greyed on an empty prompt until the visitor runs something, so the first key to press is obvious.
const HINT = 'help';

// ---------- spinning art: one loop for every [data-spin] on screen ----------

const spinning = new Set<HTMLElement>();
const onScreen = new WeakSet<HTMLElement>();
let spinObserver: IntersectionObserver | undefined;
let spinLoop = 0;

function spin(el: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  spinObserver ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = e.target as HTMLElement;
      if (e.isIntersecting) onScreen.add(t);
      else onScreen.delete(t);
    }
  });
  spinning.add(el);
  spinObserver.observe(el);
  if (spinLoop) return;
  let last = 0;
  const tick = (ts: number) => {
    spinLoop = requestAnimationFrame(tick);
    if (reduced.matches || document.hidden || ts - last < FRAME_MS) return;
    last = ts;
    for (const s of spinning) {
      if (!s.isConnected) {
        spinning.delete(s);
        spinObserver?.unobserve(s);
      } else if (onScreen.has(s)) {
        s.textContent = frame(REST_ANGLE + ts / 1100);
      }
    }
  };
  spinLoop = requestAnimationFrame(tick);
}

function loadHistory(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// ---------- the shell ----------

export class Shell {
  private readonly sb: HTMLElement;
  private readonly out: HTMLElement;
  private readonly ps: HTMLElement;
  private readonly view: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly menuEl: HTMLElement;

  private cwd: string[] = [];
  private status = 0;
  private readonly history = loadHistory();
  private cursor: HistoryCursor | null = null;
  private search: { before: number; at?: number; original: string } | null = null;
  private menu: { items: Candidate[]; index: number; start: number; end: number } | null = null;
  private busy = false;
  private stopJob: (() => void) | null = null;
  private exited = false;
  private hinted = true;
  private runId = 0;
  private visible = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly data: TerminalData,
  ) {
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    this.sb = q('[data-sb]');
    this.out = q('[data-out]');
    this.ps = q('[data-ps]');
    this.view = q('[data-view]');
    this.input = q<HTMLInputElement>('[data-in]');
    this.menuEl = q('[data-menu]');

    this.input.addEventListener('keydown', (e) => this.key(e));
    this.input.addEventListener('input', () => {
      this.cursor = null;
      if (this.search) this.search.before = this.history.length;
      this.closeMenu();
      this.render();
    });
    this.input.addEventListener('focus', () => this.setFocused(true));
    this.input.addEventListener('blur', () => this.setFocused(false));
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.input) this.render();
    });
    root.addEventListener('click', (e) => this.click(e));
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
    }).observe(root);

    this.boot();
  }

  private get live() {
    return this.visible && document.visibilityState === 'visible';
  }

  private env(): Env {
    return {
      home: this.data.home,
      cwd: this.cwd,
      setCwd: (path) => {
        this.cwd = path;
      },
      history: this.history,
      status: this.status,
      info: this.data.info,
      build: this.data.build,
      host: location.host,
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
      protocol: (url) => {
        const entry = performance.getEntriesByName(url).at(-1) as PerformanceResourceTiming | undefined;
        return entry?.nextHopProtocol || undefined;
      },
      open: (href) => this.open(href),
      clear: () => this.out.replaceChildren(),
    };
  }

  /** Replaces the server-rendered screen with a fresh one: login time and the visitor's own clock. */
  private boot() {
    const now = new Date();
    this.out.replaceChildren();
    this.print(bannerHTML(now));
    this.print(neofetchHTML(this.data.info, now, frame(REST_ANGLE), localTime(now)));
    this.render();
    this.scrollBottom();
    // Web fonts change line heights after the first layout.
    void document.fonts.ready.then(() => this.scrollBottom());
  }

  private open(href: string) {
    if (href.startsWith('/#')) {
      const target = document.getElementById(href.slice(2));
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    window.open(href, '_blank', 'noopener');
  }

  private setFocused(on: boolean) {
    this.root.classList.toggle('focus', on);
    this.render();
  }

  private focus() {
    this.input.focus({ preventScroll: true });
  }

  private click(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('a') || String(getSelection())) return;
    if (target.closest('.sug, .cur.g') && !this.busy && !this.stopJob) {
      const v = this.input.value;
      this.setValue(v + this.suggestion(v));
    }
    this.focus();
  }

  private suggestion(v: string) {
    return !v && this.hinted ? HINT : suggest(v, this.history, SUGGESTIONS);
  }

  private block(ch: string, ghost = false) {
    return `<span class="cur${ghost ? ' g' : ''}">${esc(ch)}</span>`;
  }

  private render() {
    if (this.exited) {
      this.ps.innerHTML = '';
      this.view.innerHTML = '';
      return;
    }
    if (this.busy || this.stopJob) {
      this.ps.innerHTML = '';
      this.view.innerHTML = this.block(' ');
      return;
    }
    if (this.search) {
      const hit = searchHistory(this.history, this.input.value, this.search.before);
      this.search.at = hit?.index;
      const failed = !hit && this.input.value;
      this.ps.innerHTML = span('c-dim', failed ? '(failed reverse-i-search)`' : '(reverse-i-search)`') + esc(this.input.value) + span('c-dim', "': ");
      this.view.innerHTML = esc(hit?.entry ?? '') + this.block(' ');
      return;
    }
    this.ps.innerHTML = promptHTML(this.cwd);
    const v = this.input.value;
    const pos = this.input.selectionStart ?? v.length;
    if (pos < v.length) {
      this.view.innerHTML = esc(v.slice(0, pos)) + this.block(v[pos]) + esc(v.slice(pos + 1));
      return;
    }
    const s = this.suggestion(v);
    this.view.innerHTML = esc(v) + (s ? this.block(s[0], true) + `<span class="sug">${esc(s.slice(1))}</span>` : this.block(' '));
  }

  private setValue(v: string, caret = v.length) {
    this.input.value = v;
    this.input.setSelectionRange(caret, caret);
    this.render();
  }

  private bell() {
    this.root.classList.add('bell');
    setTimeout(() => this.root.classList.remove('bell'), 140);
  }

  private scrollBottom() {
    this.sb.scrollTop = this.sb.scrollHeight;
  }

  /** Follows output only when the reader is already at the bottom, unless `force`. */
  private print(html: string, force = false) {
    const atBottom = this.sb.scrollHeight - this.sb.scrollTop - this.sb.clientHeight < 40;
    const el = document.createElement('div');
    el.className = 'blk';
    el.innerHTML = html;
    this.out.append(el);
    el.querySelectorAll<HTMLElement>('[data-spin]').forEach(spin);
    while (this.out.childElementCount > SCROLLBACK) this.out.firstElementChild?.remove();
    if (atBottom || force) this.scrollBottom();
  }

  private echo(line: string) {
    const el = document.createElement('div');
    el.className = 'echo';
    el.innerHTML = promptHTML(this.cwd) + esc(line);
    this.out.append(el);
    this.scrollBottom();
  }

  private record(line: string) {
    if (this.history.at(-1) !== line) this.history.push(line);
    if (this.history.length > HISTORY_MAX) this.history.splice(0, this.history.length - HISTORY_MAX);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      // Private windows refuse storage; history then lasts for this visit only.
    }
  }

  private closeMenu() {
    this.menu = null;
    this.menuEl.hidden = true;
  }

  private key(e: KeyboardEvent) {
    const k = e.key;
    const lower = k.toLowerCase();
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    const copying = () => String(getSelection()).length > 0;

    if (this.exited) {
      e.preventDefault();
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(k)) this.restart();
      return;
    }
    if (this.busy || this.stopJob) {
      if (ctrl && lower === 'c') {
        if (!copying()) {
          e.preventDefault();
          this.interrupt();
        }
      } else if (k !== 'Tab') {
        e.preventDefault();
      }
      return;
    }
    if (this.search) return this.searchKey(e, k, lower, ctrl);
    if (k !== 'Tab' && k !== 'Shift') this.closeMenu();

    const v = this.input.value;
    const pos = this.input.selectionStart ?? v.length;
    this.scrollBottom();

    if (k === 'Enter') {
      e.preventDefault();
      void this.submit();
    } else if (k === 'Tab') {
      // An empty prompt lets Tab leave the terminal, so keyboard users are never trapped.
      if (!v && !this.menu) return;
      e.preventDefault();
      this.complete(e.shiftKey);
    } else if ((k === 'ArrowRight' || k === 'End' || (ctrl && (lower === 'f' || lower === 'e'))) && pos === v.length && this.suggestion(v)) {
      e.preventDefault();
      this.setValue(v + this.suggestion(v));
    } else if (ctrl && lower === 'e') {
      e.preventDefault();
      this.setValue(v);
    } else if (ctrl && lower === 'a') {
      e.preventDefault();
      this.setValue(v, 0);
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const step = stepHistory(this.history, this.cursor, v, k === 'ArrowUp' ? -1 : 1);
      if (!step) return this.bell();
      this.cursor = step.cursor;
      this.setValue(step.value);
    } else if (ctrl && lower === 'c') {
      if (copying()) return;
      e.preventDefault();
      this.echo(`${v}^C`);
      this.cursor = null;
      this.setValue('');
    } else if (ctrl && lower === 'l') {
      e.preventDefault();
      this.out.replaceChildren();
    } else if (ctrl && lower === 'u') {
      e.preventDefault();
      this.setValue(v.slice(pos), 0);
    } else if (ctrl && lower === 'k') {
      e.preventDefault();
      this.setValue(v.slice(0, pos));
    } else if (ctrl && lower === 'r') {
      e.preventDefault();
      this.search = { before: this.history.length, original: v };
      this.input.value = '';
      this.render();
    } else if (ctrl && lower === 'd') {
      e.preventDefault();
      if (!v) {
        this.echo('');
        void this.exec('exit');
      }
    } else {
      // Caret moves (arrows, Home, Backspace) land after the default action.
      requestAnimationFrame(() => this.render());
    }
  }

  private searchKey(e: KeyboardEvent, k: string, lower: string, ctrl: boolean) {
    const search = this.search!;
    const hit = searchHistory(this.history, this.input.value, search.before);
    const leave = (v: string) => {
      this.search = null;
      this.setValue(v);
    };
    if (k === 'Enter') {
      e.preventDefault();
      leave(hit?.entry ?? '');
      void this.submit();
    } else if (ctrl && lower === 'r') {
      e.preventDefault();
      if (hit) search.before = hit.index;
      this.render();
    } else if (ctrl && (lower === 'g' || lower === 'c')) {
      e.preventDefault();
      leave(search.original);
    } else if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) {
      e.preventDefault();
      leave(hit?.entry ?? search.original);
    } else {
      requestAnimationFrame(() => this.render());
    }
  }

  private complete(back: boolean) {
    if (this.menu) {
      const m = this.menu;
      m.index = (m.index + (back ? -1 : 1) + m.items.length) % m.items.length;
      m.end = this.replace(m.start, m.end, m.items[m.index].value);
      return this.drawMenu();
    }
    const v = this.input.value;
    const pos = this.input.selectionStart ?? v.length;
    const { words, cur, start } = completionTarget(v, pos);
    const items = candidates(this.env(), words, cur).filter((c) => c.value.startsWith(cur));
    if (!items.length) return this.bell();
    if (items.length === 1) {
      this.replace(start, pos, items[0].value + (items[0].dir ? '' : ' '));
      return;
    }
    const prefix = commonPrefix(items.map((x) => x.value));
    const end = prefix.length > cur.length ? this.replace(start, pos, prefix) : pos;
    this.menu = { items, index: -1, start, end };
    this.drawMenu();
  }

  private replace(start: number, end: number, word: string) {
    const v = this.input.value;
    this.setValue(v.slice(0, start) + word + v.slice(end), start + word.length);
    return start + word.length;
  }

  private drawMenu() {
    const m = this.menu!;
    this.menuEl.innerHTML = m.items
      .map((it, i) => {
        const label = it.label ?? it.value;
        return `<span${i === m.index ? ' class="sel"' : ''}>${it.dir ? span('c-info b', label) : esc(label)}</span>`;
      })
      .join('');
    this.menuEl.hidden = false;
    this.scrollBottom();
  }

  private async submit() {
    const line = this.input.value;
    this.echo(line);
    this.cursor = null;
    this.closeMenu();
    this.setValue('');
    if (line.trim()) {
      this.hinted = false;
      this.record(line.trim());
    }
    await this.exec(line);
  }

  private async exec(line: string) {
    if (!line.trim()) {
      this.render();
      return;
    }
    const id = ++this.runId;
    this.busy = true;
    this.render();
    let res: Result;
    try {
      res = await run(line.trim(), this.env());
    } catch (err) {
      res = { text: String(err), status: 1 };
    }
    if (id !== this.runId) return;
    this.busy = false;
    this.status = res.status ?? 0;
    const html = toHTML(res);
    if (html) this.print(html, true);
    if (res.job) this.stopJob = res.job({ print: (h) => this.print(h), live: () => this.live });
    if (res.exit) this.exited = true;
    this.render();
    this.scrollBottom();
  }

  private interrupt() {
    if (this.stopJob) {
      this.stopJob();
      this.stopJob = null;
    } else {
      this.runId++;
      this.busy = false;
    }
    this.print('^C', true);
    this.status = 130;
    this.render();
  }

  private restart() {
    this.exited = false;
    this.status = 0;
    this.cwd = [];
    this.boot();
  }
}

export function initTerminal(root: HTMLElement) {
  const raw = root.querySelector('[data-terminal-data]')?.textContent;
  if (!raw) return;
  new Shell(root, JSON.parse(raw) as TerminalData);
}
