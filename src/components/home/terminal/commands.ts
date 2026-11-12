import type { FeedEntry } from '../../../lib/content/schemas';
import { closest, tokenize } from './editor';
import { absPath, type DirNode, type FileNode, type FsNode, nodeSize, pathLabel, resolve } from './fs';
import { esc, highlightJson, link, linkify, span } from './html';
import { localTime, neofetchHTML, neofetchText, type NeofetchInfo } from './neofetch';
import { frame, REST_ANGLE } from './spinner';

export const POLL_MS = 5_000;

export interface Build {
  version: string;
  commit: string;
  branch: string;
}

/** What a command can see and touch; the shell supplies the browser-backed one. */
export interface Env {
  home: DirNode;
  cwd: string[];
  setCwd(path: string[]): void;
  history: readonly string[];
  status: number;
  info: NeofetchInfo;
  build: Build;
  host: string;
  fetch: typeof fetch;
  now(): Date;
  /** `nextHopProtocol` of a fetched URL, when the browser knows it. */
  protocol(url: string): string | undefined;
  open(href: string): void;
  clear(): void;
}

export type Job = (io: { print(html: string): void; live(): boolean }) => () => void;

/** `text` is what a pipe passes on; `html` and `json` only change how the last stage prints. */
export interface Result {
  text?: string;
  html?: string;
  json?: unknown;
  status?: number;
  job?: Job;
  exit?: boolean;
}

interface Ctx {
  env: Env;
  stdin?: Result;
  piped: boolean;
}

interface Command {
  summary: string;
  hidden?: boolean;
  run(args: string[], ctx: Ctx): Result | Promise<Result>;
}

export const toText = (r: Result | undefined): string =>
  r == null ? '' : r.text != null ? r.text : r.json !== undefined ? JSON.stringify(r.json, null, 2) : '';

export const toHTML = (r: Result): string =>
  r.html != null ? r.html : r.json !== undefined ? highlightJson(r.json) : r.text ? linkify(esc(r.text)) : '';

const p2 = (n: number) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clock = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const loginStamp = (d: Date) => `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${clock(d)} ${d.getFullYear()}`;
const SESSION_AGE_MS = 131_000;

/** The tty1 login that opens the session. */
export const bannerHTML = (now: Date) =>
  `Ubuntu 24.04.1 LTS ubuntu tty1\n\nubuntu login: juan\nPassword: \nWelcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-49-generic x86_64)\n\n${span('c-dim', `Last login: ${loginStamp(new Date(now.getTime() - SESSION_AGE_MS))} on tty1`)}`;

// ---------- access log ----------

const PATH_WIDTH = 22;
function logCells(e: FeedEntry) {
  const p = e.p.length > PATH_WIDTH ? `${e.p.slice(0, PATH_WIDTH - 1)}…` : e.p;
  return [clock(new Date(e.t)), e.m.padEnd(4), p.padEnd(PATH_WIDTH), String(e.s), e.c.padEnd(4), `${e.ms} ms`.padStart(7)];
}
export const logText = (e: FeedEntry) => logCells(e).join('  ');
export function logHTML(e: FeedEntry): string {
  const [t, m, p, s, c, ms] = logCells(e);
  return [span('c-dim', t), span('c-dim', m), esc(p), span(e.s < 400 ? 'c-ok' : 'c-err', s), span(e.c === 'cold' ? 'c-info' : 'c-dim', c), span('c-dim', ms)].join('  ');
}
const feedKey = (e: FeedEntry) => `${e.t}|${e.m}|${e.p}|${e.s}`;

/** The live feed, oldest first. */
async function fetchFeed(env: Env): Promise<FeedEntry[]> {
  const res = await env.fetch('/api/requests', { cache: 'no-store' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const { entries } = (await res.json()) as { entries: FeedEntry[] };
  return [...entries].sort((a, b) => a.t - b.t);
}

function follow(env: Env, shown: FeedEntry[]): Job {
  return (io) => {
    let known = new Set(shown.map(feedKey));
    let inFlight = false;
    const tick = async () => {
      if (inFlight || !io.live()) return;
      inFlight = true;
      try {
        const batch = await fetchFeed(env);
        for (const e of batch) if (!known.has(feedKey(e))) io.print(logHTML(e));
        // The feed only returns its latest entries, so the newest batch is all there is to remember.
        known = new Set(batch.map(feedKey));
      } catch {
        // Keep following; the next tick retries.
      } finally {
        inFlight = false;
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  };
}

async function logLines(env: Env, n: number): Promise<Result> {
  try {
    const rows = (await fetchFeed(env)).slice(-n);
    return { html: rows.map(logHTML).join('\n'), text: rows.map(logText).join('\n') };
  } catch {
    return { text: 'access.log: the live log is unreachable right now', status: 1 };
  }
}

// ---------- files ----------

function markdownHTML(body: string): string {
  return body
    .split('\n')
    .map((l, i) => {
      if (l.startsWith('# ')) return span('c-acc b', l);
      if (l.startsWith('## ')) return span('b', l);
      if (i === 1 && body.startsWith('# ')) return span('c-dim', l);
      if (l.startsWith('- ')) return span('c-dim', '-') + linkify(esc(l.slice(1)));
      return linkify(esc(l));
    })
    .join('\n');
}

async function readFile(env: Env, node: FileNode, name: string, logRows = 12): Promise<Result> {
  switch (node.kind) {
    case 'md':
      return { html: markdownHTML(node.body ?? ''), text: node.body ?? '' };
    case 'txt':
      return { text: node.body ?? '' };
    case 'json':
      return { json: node.json };
    case 'pdf':
      return { text: `cat: ${name}: binary file, try: open ${name}`, status: 1 };
    case 'log':
      return logLines(env, logRows);
  }
}

/** Text of a named file or of the piped input, for the filters. */
async function input(cmd: string, file: string | undefined, { env, stdin }: Ctx): Promise<{ text: string } | { error: Result }> {
  if (file) {
    const r = resolve(env.home, env.cwd, file);
    if (!r) return { error: { text: `${cmd}: ${file}: No such file or directory`, status: 2 } };
    if (r.node.t === 'd') return { error: { text: `${cmd}: ${file}: Is a directory`, status: 2 } };
    return { text: toText(await readFile(env, r.node, file)) };
  }
  if (stdin) return { text: toText(stdin) };
  return { error: { text: `${cmd}: nothing to read, name a file or pipe something in`, status: 2 } };
}

const split = (args: string[]) => ({
  flags: args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join(''),
  rest: args.filter((a) => !/^-[a-zA-Z]+$/.test(a)),
});

function nameHTML(name: string, node: FsNode) {
  if (node.t === 'd') return span('c-info b', name);
  if (node.kind === 'log') return span('c-ok', name);
  if (node.kind === 'pdf') return span('c-mag', name);
  return esc(name);
}

// ---------- curl ----------

function curlPath(url: string, host: string): string | { error: Result } {
  const bare = url.replace(/^https?:\/\//, '');
  const hosts = ['juanalmaraz.dev', 'www.juanalmaraz.dev', host];
  for (const h of hosts) {
    if (bare === h || bare.startsWith(`${h}/`)) return bare.slice(h.length) || '/';
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(bare) || /^localhost(:\d+)?(\/|$)/.test(bare)) {
    return { error: { text: `curl: (6) Could not resolve host: ${bare.split('/')[0]}`, status: 6 } };
  }
  return bare.startsWith('/') ? bare : `/${bare}`;
}

const PROTOCOLS: Record<string, string> = { h2: 'HTTP/2', h3: 'HTTP/3', 'http/1.1': 'HTTP/1.1', 'http/1.0': 'HTTP/1.0' };
const BODY_LINES = 120;

async function curl(args: string[], { env }: Ctx): Promise<Result> {
  const { flags, rest } = split(args);
  const url = rest[0];
  if (!url) return { text: "curl: try 'curl --help' or 'curl --manual' for more information", status: 2 };
  const path = curlPath(url, env.host);
  if (typeof path !== 'string') return path.error;
  const head = flags.includes('I');
  const verbose = flags.includes('v');
  const include = flags.includes('i') || head;
  const method = head ? 'HEAD' : 'GET';

  let res: Response;
  try {
    res = await env.fetch(path, { method, cache: 'no-store' });
  } catch {
    return { text: `curl: (7) Failed to connect to ${env.host}`, status: 7 };
  }
  const raw = head ? '' : await res.text();
  // Resource timing knows the protocol only once the response has finished.
  const proto = PROTOCOLS[env.protocol(res.url) ?? ''] ?? 'HTTP/1.1';
  const headers: string[] = [];
  res.headers.forEach((value, key) => headers.push(`${key}: ${value}`));
  const statusLine = `${proto} ${res.status}`;
  const headText = [statusLine, ...headers].join('\n');
  const headHTML = [`${span('b', proto)} ${span(`${res.ok ? 'c-ok' : 'c-err'} b`, res.status)}`, ...headers.map((h) => {
    const i = h.indexOf(':');
    return span('c-dim', h.slice(0, i + 1)) + esc(h.slice(i + 1));
  })].join('\n');

  let preText = '';
  let preHTML = '';
  if (verbose) {
    preText = [`> ${method} ${path} ${proto}`, `> Host: ${env.host}`, '> Accept: */*', '>', ...headText.split('\n').map((l) => `< ${l}`), '<'].join('\n');
    preHTML = span('c-dim', preText);
  } else if (include) {
    preText = headText;
    preHTML = headHTML;
  }
  if (head) return { html: preHTML, text: preText };

  let json: unknown;
  if ((res.headers.get('content-type') ?? '').includes('json')) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = undefined;
    }
  }
  const lines = raw.split('\n');
  const clipped = lines.length > BODY_LINES ? `${lines.slice(0, BODY_LINES).join('\n')}\n` : raw;
  const more = lines.length > BODY_LINES ? span('c-dim', `… ${lines.length - BODY_LINES} more lines`) : '';
  const bodyText = json !== undefined ? JSON.stringify(json, null, 2) : raw;
  const bodyHTML = json !== undefined ? highlightJson(json) : esc(clipped) + more;
  if (!preText) return json !== undefined ? { json } : { html: bodyHTML, text: bodyText };
  return { html: `${preHTML}\n\n${bodyHTML}`, text: `${preText}\n\n${bodyText}` };
}

// ---------- jq ----------

function jq(value: unknown, filter: string): unknown[] {
  let values = [value];
  let piped = false;
  for (const t of filter.match(/\[\]|\[\d+\]|[A-Za-z_][\w-]*|\|/g) ?? []) {
    if (t === '|') {
      piped = true;
      continue;
    }
    values = values.flatMap((x) => {
      const obj = x !== null && typeof x === 'object' ? (x as Record<string, unknown>) : null;
      if (t === '[]') return Array.isArray(x) ? x : obj ? Object.values(obj) : [];
      if (t.startsWith('[')) return [Array.isArray(x) ? (x[Number(t.slice(1, -1))] ?? null) : null];
      if (piped && t === 'keys') return [obj ? Object.keys(obj) : null];
      if (piped && t === 'length') return [x == null ? 0 : obj ? Object.keys(obj).length : String(x).length];
      return [obj && Object.hasOwn(obj, t) ? obj[t] : null];
    });
    piped = false;
  }
  return values;
}

// ---------- commands ----------

const HELP: [string, string][] = [
  ['ls [dir]', 'list files'],
  ['cd <dir>', 'change directory'],
  ['cat <file>', 'print a file'],
  ['curl <url>', 'call the public API, -i shows headers'],
  ['tail -f access.log', 'follow live traffic, Ctrl+C stops'],
  ['open <file>', 'open resume.pdf, github, linkedin or a post'],
  ['neofetch', 'who I am, at a glance'],
  ['git log', 'the commit this page was built from'],
  ['history', 'your past commands'],
  ['clear', 'clear the screen'],
];
const ALSO = 'also: pwd, whoami, date, echo, man, which, exit';

const readOnly = (name: string): Command => ({
  summary: 'not available, the filesystem is read-only',
  hidden: true,
  run: (args) => ({ text: `${name}: cannot modify '${args.find((a) => !a.startsWith('-')) ?? ''}': Read-only file system`, status: 1 }),
});

export const ALIASES: Record<string, string> = { ll: 'ls -la', la: 'ls -a', l: 'ls' };

export const COMMANDS: Record<string, Command> = {
  help: {
    summary: 'list the commands',
    run: () => ({
      html: `${span('c-acc b', 'Commands')}\n${HELP.map(([c, d]) => `  ${esc(c.padEnd(22))}${span('c-dim', d)}`).join('\n')}\n  ${span('c-dim', ALSO)}`,
      text: `Commands\n${HELP.map(([c, d]) => `  ${c.padEnd(22)}${d}`).join('\n')}\n  ${ALSO}`,
    }),
  },
  ls: {
    summary: 'list directory contents',
    run(args, { env }) {
      const { flags, rest } = split(args);
      const long = flags.includes('l');
      const all = flags.includes('a');
      const targets = rest.length ? rest : ['.'];
      const html: string[] = [];
      const text: string[] = [];
      let status = 0;
      for (const t of targets) {
        const r = resolve(env.home, env.cwd, t);
        if (!r) {
          const msg = `ls: cannot access '${t}': No such file or directory`;
          html.push(esc(msg));
          text.push(msg);
          status = 2;
          continue;
        }
        if (targets.length > 1) {
          html.push(`${esc(t)}:`);
          text.push(`${t}:`);
        }
        let entries: [string, FsNode][] =
          r.node.t === 'd'
            ? Object.entries(r.node.c)
                .filter(([n]) => all || !n.startsWith('.'))
                .sort(([a], [b]) => a.replace(/^\./, '').localeCompare(b.replace(/^\./, '')))
            : [[t.split('/').pop() ?? t, r.node]];
        if (all && r.node.t === 'd') entries = [['.', r.node], ['..', r.node], ...entries];
        if (long) {
          const d = env.now();
          const date = `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
          html.push(`total ${entries.length * 4}`);
          text.push(`total ${entries.length * 4}`);
          for (const [n, node] of entries) {
            const meta = `${node.t === 'd' ? 'drwxr-xr-x' : '-rw-r--r--'} juan juan ${String(nodeSize(node) ?? '-').padStart(6)} ${date} `;
            html.push(span('c-dim', meta) + nameHTML(n, node));
            text.push(meta + n);
          }
        } else {
          html.push(entries.map(([n, node]) => nameHTML(n, node)).join('  '));
          text.push(...entries.map(([n]) => n));
        }
      }
      return { html: html.join('\n'), text: text.join('\n'), status };
    },
  },
  cd: {
    summary: 'change directory',
    run(args, { env }) {
      const t = args[0];
      if (!t || t === '~') {
        env.setCwd([]);
        return {};
      }
      const r = resolve(env.home, env.cwd, t);
      if (!r) return { text: `bash: cd: ${t}: No such file or directory`, status: 1 };
      if (r.node.t !== 'd') return { text: `bash: cd: ${t}: Not a directory`, status: 1 };
      env.setCwd(r.path);
      return {};
    },
  },
  pwd: { summary: 'print the working directory', run: (_, { env }) => ({ text: absPath(env.cwd) }) },
  cat: {
    summary: 'print files',
    async run(args, ctx) {
      const files = split(args).rest;
      if (!files.length) return { text: toText(ctx.stdin) };
      const outs: Result[] = [];
      for (const f of files) {
        const r = resolve(ctx.env.home, ctx.env.cwd, f);
        if (!r) outs.push({ text: `cat: ${f}: No such file or directory`, status: 1 });
        else if (r.node.t === 'd') outs.push({ text: `cat: ${f}: Is a directory`, status: 1 });
        else outs.push(await readFile(ctx.env, r.node, f));
      }
      const status = outs.reduce((s, o) => o.status || s, 0);
      if (outs.length === 1) return { ...outs[0], status };
      return { html: outs.map(toHTML).join('\n'), text: outs.map(toText).join('\n'), status };
    },
  },
  less: { summary: 'view a file', hidden: true, run: (args, ctx) => COMMANDS.cat.run(args, ctx) },
  head: {
    summary: 'print the first lines',
    async run(args, ctx) {
      let n = 10;
      let file: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n') n = Number(args[++i]) || 10;
        else if (/^-\d+$/.test(args[i])) n = Number(args[i].slice(1));
        else file = args[i];
      }
      const r = await input('head', file, ctx);
      return 'error' in r ? r.error : { text: r.text.split('\n').slice(0, n).join('\n') };
    },
  },
  tail: {
    summary: 'print the last lines, -f follows',
    async run(args, ctx) {
      let n = 10;
      let followFlag = false;
      let file: string | undefined;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-f' || a === '-F') followFlag = true;
        else if (a === '-n') n = Number(args[++i]) || 10;
        else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
        else file = a;
      }
      const r = file ? resolve(ctx.env.home, ctx.env.cwd, file) : null;
      if (!file || r?.node.t !== 'f' || r.node.kind !== 'log') {
        const res = await input('tail', file, ctx);
        return 'error' in res ? res.error : { text: res.text.split('\n').slice(-n).join('\n') };
      }
      let rows: FeedEntry[];
      try {
        rows = (await fetchFeed(ctx.env)).slice(-n);
      } catch {
        return { text: `tail: cannot open '${file}' for reading: the live log is unreachable right now`, status: 1 };
      }
      const out = { html: rows.map(logHTML).join('\n'), text: rows.map(logText).join('\n') };
      return followFlag && !ctx.piped ? { ...out, job: follow(ctx.env, rows) } : out;
    },
  },
  grep: {
    summary: 'print matching lines',
    async run(args, ctx) {
      const { flags, rest } = split(args);
      if (rest[0] == null) return { text: 'usage: grep [-icv] pattern [file]', status: 2 };
      const r = await input('grep', rest[1], ctx);
      if ('error' in r) return r.error;
      const re = (() => {
        const f = flags.includes('i') ? 'gi' : 'g';
        try {
          return new RegExp(rest[0], f);
        } catch {
          return new RegExp(rest[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f);
        }
      })();
      const invert = flags.includes('v');
      const lines = r.text.split('\n').filter((l) => {
        re.lastIndex = 0;
        return re.test(l) !== invert;
      });
      if (flags.includes('c')) return { text: String(lines.length) };
      if (!lines.length) return { text: '', status: 1 };
      const mark = (l: string) => {
        let out = '';
        let last = 0;
        for (const m of l.matchAll(re)) {
          if (!m[0]) break;
          out += esc(l.slice(last, m.index)) + span('c-err b', m[0]);
          last = m.index + m[0].length;
        }
        return out + esc(l.slice(last));
      };
      return { html: lines.map((l) => (invert ? esc(l) : mark(l))).join('\n'), text: lines.join('\n') };
    },
  },
  jq: {
    summary: 'pick fields from JSON',
    run(args, { stdin }) {
      const { flags, rest } = split(args);
      if (!stdin) return { text: 'jq: no input, try: curl /api/me | jq .name', status: 2 };
      let value = stdin.json;
      if (value === undefined) {
        try {
          value = JSON.parse(toText(stdin));
        } catch {
          return { text: 'jq: error (at <stdin>:1): Cannot parse input as JSON', status: 2 };
        }
      }
      const raw = flags.includes('r');
      const values = jq(value, rest[0] ?? '.');
      const plain = (v: unknown): v is string => raw && typeof v === 'string';
      return {
        html: values.map((v) => (plain(v) ? linkify(esc(v)) : highlightJson(v))).join('\n'),
        text: values.map((v) => (plain(v) ? v : JSON.stringify(v, null, 2))).join('\n'),
      };
    },
  },
  wc: {
    summary: 'count lines, words and bytes',
    async run(args, ctx) {
      const { flags, rest } = split(args);
      const r = await input('wc', rest[0], ctx);
      if ('error' in r) return r.error;
      const counts: [string, number][] = [['l', r.text.split('\n').length], ['w', r.text.split(/\s+/).filter(Boolean).length], ['c', r.text.length]];
      const shown = flags ? counts.filter(([f]) => flags.includes(f)) : counts;
      return { text: shown.map(([, n]) => String(n).padStart(8)).join('') + (rest[0] ? ` ${rest[0]}` : '') };
    },
  },
  sort: {
    summary: 'sort lines',
    async run(args, ctx) {
      const { flags, rest } = split(args);
      const r = await input('sort', rest[0], ctx);
      if ('error' in r) return r.error;
      const lines = r.text.split('\n').sort();
      return { text: (flags.includes('r') ? lines.reverse() : lines).join('\n') };
    },
  },
  curl: { summary: 'transfer a URL', run: curl },
  open: {
    summary: 'open a file or link',
    run(args, { env }) {
      const t = args[0];
      if (!t) return { text: 'usage: open <file | github | linkedin>', status: 1 };
      const named: Record<string, string> = { github: env.info.links.github, linkedin: env.info.links.linkedin, resume: env.info.links.resume };
      let href = Object.hasOwn(named, t) ? named[t] : undefined;
      if (!href) {
        const r = resolve(env.home, env.cwd, t);
        if (!r) return { text: `open: ${t}: No such file or directory`, status: 1 };
        href = r.node.href;
        if (!href) return { text: `open: nothing to open for ${t}, try: cat ${t}`, status: 1 };
      }
      env.open(href);
      return { html: `${span('c-dim', 'opening')} ${link(href, href)}`, text: href };
    },
  },
  neofetch: {
    summary: 'who I am, at a glance',
    run(_, { env }) {
      const now = env.now();
      return { html: neofetchHTML(env.info, now, frame(REST_ANGLE), localTime(now)), text: neofetchText(env.info, now, localTime(now)) };
    },
  },
  git: {
    summary: 'version control',
    run(args, { env }) {
      const { commit, branch, version } = env.build;
      if (args[0] === 'log') {
        const refs = `${span('c-cyan b', '(HEAD -> ')}${span('c-ok b', branch)}${span('c-cyan b', ', tag: ')}${span('c-acc b', `v${version}`)}${span('c-cyan b', ')')}`;
        return {
          html: `${span('c-acc', `commit ${commit}`)} ${refs}\n\n    ${span('c-dim', 'the commit this page was built from')}`,
          text: `commit ${commit} (HEAD -> ${branch}, tag: v${version})`,
        };
      }
      if (args[0] === 'status') return { text: `On branch ${branch}\nnothing to commit, working tree clean` };
      if (!args[0]) return { text: 'usage: git <command>\n\nthis box knows: git log, git status' };
      return { text: `git: '${args[0]}' is not a git command. See 'git --help'.`, status: 1 };
    },
  },
  history: {
    summary: 'your past commands',
    run: (_, { env }) => ({ text: env.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join('\n') }),
  },
  whoami: { summary: 'print the user name', run: () => ({ text: 'juan' }) },
  date: {
    summary: 'print the date',
    run(_, { env }) {
      const d = env.now();
      const off = -d.getTimezoneOffset();
      const zone = `${off >= 0 ? '+' : '-'}${p2(Math.floor(Math.abs(off) / 60))}${off % 60 ? p2(Math.abs(off) % 60) : ''}`;
      return { text: `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${clock(d)} ${zone} ${d.getFullYear()}` };
    },
  },
  echo: {
    summary: 'print text',
    run(args, { env }) {
      const vars: Record<string, string> = { USER: 'juan', HOME: absPath([]), SHELL: '/bin/bash', PWD: absPath(env.cwd), EDITOR: 'vim' };
      return { text: args.join(' ').replace(/\$\?/g, String(env.status)).replace(/\$(\w+)/g, (_, k: string) => (Object.hasOwn(vars, k) ? vars[k] : '')) };
    },
  },
  man: {
    summary: 'show a manual page',
    run(args) {
      const name = args[0];
      if (!name) return { text: "What manual page do you want?\nFor example, try 'man curl'.", status: 1 };
      if (!Object.hasOwn(COMMANDS, name)) return { text: `No manual entry for ${name}`, status: 16 };
      const title = `${name.toUpperCase()}(1)`;
      return { html: `${span('b', title.padEnd(30))}User Commands\n\n${span('b', 'NAME')}\n       ${esc(name)} - ${esc(COMMANDS[name].summary)}` };
    },
  },
  which: {
    summary: 'locate a command',
    run(args) {
      const name = args[0] ?? '';
      if (!Object.hasOwn(COMMANDS, name)) return { text: '', status: 1 };
      return { text: ['cd', 'history', 'echo', 'pwd', 'exit'].includes(name) ? `${name}: shell built-in command` : `/usr/bin/${name}` };
    },
  },
  clear: {
    summary: 'clear the screen',
    run: (_, { env }) => {
      env.clear();
      return {};
    },
  },
  exit: { summary: 'close the session', run: () => ({ html: `logout\n\n${span('c-dim', '[Process completed]')}`, text: 'logout', exit: true }) },
  sudo: {
    summary: 'run as root',
    hidden: true,
    run: () => ({ text: '[sudo] password for juan: \nSorry, try again.\nsudo: 1 incorrect password attempt', status: 1 }),
  },
  finger: {
    summary: 'user information',
    hidden: true,
    run(args, { env }) {
      if (args[0] && args[0] !== 'juan') return { text: `finger: ${args[0]}: no such user.`, status: 1 };
      return { text: `Login: juan\t\t\tName: Juan Almaraz\nDirectory: ${absPath([])}\tShell: /bin/bash\nOffice: ${env.info.based}\nPlan:\n${env.info.role}.` };
    },
  },
  rm: readOnly('rm'),
  mv: readOnly('mv'),
  cp: readOnly('cp'),
  touch: readOnly('touch'),
  mkdir: readOnly('mkdir'),
};

const visible = () => Object.keys(COMMANDS).filter((n) => !COMMANDS[n].hidden);

function notFound(name: string): Result {
  const near = closest(name, visible());
  return { html: esc(`${name}: command not found`) + (near ? `\n${span('c-dim', `did you mean ${near}?`)}` : ''), text: `${name}: command not found`, status: 127 };
}

/** Runs one input line: aliases, then each `|` stage with the previous result as its input. */
export async function run(line: string, env: Env): Promise<Result> {
  const stages = line.split('|').map((s) => s.trim());
  let res: Result | undefined;
  for (let i = 0; i < stages.length; i++) {
    let words = tokenize(stages[i]);
    if (!words.length) return { text: "bash: syntax error near unexpected token `|'", status: 2 };
    if (Object.hasOwn(ALIASES, words[0])) words = [...tokenize(ALIASES[words[0]]), ...words.slice(1)];
    const [name, ...args] = words;
    if (!Object.hasOwn(COMMANDS, name)) return notFound(name);
    res = await COMMANDS[name].run(args, { env, stdin: res, piped: i < stages.length - 1 });
  }
  return res ?? {};
}

export const SUGGESTIONS = [
  'help', 'curl /api/me', 'curl /api/stack', 'curl /api/now', 'curl -i /api/me', 'cat about.md', 'cd projects',
  'ls', 'tail -f access.log', 'neofetch', 'git log', 'open resume.pdf', 'history', 'whoami',
];

const API_PATHS = ['/api/me', '/api/stack', '/api/now', '/api/experience', '/api/requests', '/api/status', '/api/health'];
const FLAGS: Record<string, string[]> = {
  ls: ['-l', '-a', '-la'], curl: ['-i', '-I', '-v'], tail: ['-f', '-n'], head: ['-n'], grep: ['-i', '-v', '-c'], jq: ['-r'], wc: ['-l', '-w', '-c'],
};

export interface Candidate {
  value: string;
  label?: string;
  dir?: boolean;
}

function pathCandidates(env: Env, cur: string, dirsOnly: boolean): Candidate[] {
  const slash = cur.lastIndexOf('/');
  const dirPart = cur.slice(0, slash + 1);
  const base = cur.slice(slash + 1);
  const r = resolve(env.home, env.cwd, dirPart || '.');
  if (!r || r.node.t !== 'd') return [];
  return Object.entries(r.node.c)
    .filter(([n, node]) => (!dirsOnly || node.t === 'd') && (base.startsWith('.') || !n.startsWith('.')))
    .map(([n, node]) => {
      const dir = node.t === 'd';
      return { value: dirPart + n + (dir ? '/' : ''), label: n + (dir ? '/' : ''), dir };
    });
}

/** Everything Tab could insert for the current word, before filtering by what was typed. */
export function candidates(env: Env, words: string[], cur: string): Candidate[] {
  const of = (xs: string[]) => xs.map((value) => ({ value }));
  if (words.length === 1) return of([...visible(), ...Object.keys(ALIASES)].sort());
  const cmd = words[0];
  if (cur.startsWith('-')) return of(FLAGS[cmd] ?? []);
  switch (cmd) {
    case 'curl':
      return of(API_PATHS);
    case 'man':
    case 'which':
      return of(visible());
    case 'git':
      return words.length === 2 ? of(['log', 'status']) : [];
    case 'open':
      return [...pathCandidates(env, cur, false), ...of(['github', 'linkedin'])];
    case 'grep':
    case 'jq':
      return words.length === 2 ? [] : pathCandidates(env, cur, false);
    default:
      return pathCandidates(env, cur, cmd === 'cd');
  }
}

export const promptHTML = (cwd: readonly string[]) => `${span('c-ok b', 'juan@ubuntu')}:${span('c-info b', pathLabel(cwd))}$ `;
