import { afterEach, describe, expect, it, vi } from 'vitest';
import { candidates, COMMANDS, type Env, run, toHTML } from '../../src/components/home/terminal/commands';
import { terminalData, type TerminalContent } from '../../src/components/home/terminal/data';
import { closest, commonPrefix, completionTarget, searchHistory, stepHistory, suggest, tokenize } from '../../src/components/home/terminal/editor';
import { neofetchHTML, rows } from '../../src/components/home/terminal/neofetch';
import { COLS, frame, REST_ANGLE, ROWS } from '../../src/components/home/terminal/spinner';

const content: TerminalContent = {
  site: {
    lede: 'I build APIs.',
    roleLine: 'Backend Engineer · Node.js · GCP',
    resumePath: 'files/resume/cv.pdf',
    now: { building: 'juanalmaraz.dev' },
    languages: 'Spanish (native), English (C1)',
    careerStart: '2024-04',
  },
  about: { bio: 'I grew up in Buenos Aires.', photos: [], questions: [] },
  experience: [
    { id: 'backend', role: 'Backend Engineer', org: 'Acme', monogram: 'AC', start: '2024-04', end: null, place: 'Buenos Aires, AR', summary: 'Builds APIs.', stack: ['Node.js', 'GCP'], order: 1 },
  ],
  projects: [
    { id: 'relay', title: 'Webhook <relay>', group: 'backend', year: 2025, summary: 'Relays events.', stack: ['Node.js'], links: [{ label: 'Source', url: 'https://github.com/x/relay' }], confidential: false, order: 1, status: 'published' },
  ],
  education: [{ id: 'sound', title: 'Sound Engineering', school: 'UNTREF', start: '2016-03', end: '2024-03', summary: 'Degree.' }],
  certificates: [{ id: 'ef', name: 'EF SET English Certificate', issuer: 'EF SET', year: 2025, level: 'C1', order: 1 }],
  posts: [{ id: 'hello', title: 'Hello', summary: 'First post.', bodyMd: 'Body.', tags: ['aws'], status: 'published', publishedAt: Date.UTC(2026, 10, 5), updatedAt: Date.UTC(2026, 10, 5) }],
};
const build = { version: '1.2.0', commit: 'abc1234', branch: 'main' };
const NOW = new Date(2026, 10, 12, 9, 14);

const feed = [
  { m: 'GET', p: '/', s: 200, c: 'warm', ms: 12, t: NOW.getTime() - 4000 },
  { m: 'GET', p: '404 · unknown path', s: 404, c: 'cold', ms: 41, t: NOW.getTime() - 3000 },
  { m: 'GET', p: '/api/me', s: 200, c: 'warm', ms: 9, t: NOW.getTime() - 2000 },
];

function makeEnv(entries = feed) {
  const data = terminalData(content, build);
  const opened: string[] = [];
  const requests: string[] = [];
  const env: Env = {
    home: data.home,
    cwd: [],
    setCwd: (p) => {
      env.cwd = p;
    },
    history: [],
    status: 0,
    info: data.info,
    build: data.build,
    host: 'localhost:4321',
    fetch: async (input) => {
      const path = String(input);
      requests.push(path);
      if (path === '/api/me') {
        return new Response(JSON.stringify({ name: 'Juan Almaraz', links: { github: 'https://github.com/almarazj' } }), {
          headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=60' },
        });
      }
      if (path === '/api/requests') return Response.json({ entries: [...entries].reverse() });
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    },
    now: () => NOW,
    protocol: () => 'h2',
    open: (href) => opened.push(href),
    clear: () => {},
  };
  return { env, opened, requests };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('spinner', () => {
  it('draws ROWS lines of COLS characters', () => {
    const lines = frame(REST_ANGLE).split('\n');
    expect(lines).toHaveLength(ROWS);
    for (const l of lines) expect(l).toHaveLength(COLS);
    expect(frame(REST_ANGLE).trim()).not.toBe('');
  });

  it('changes as the angle changes', () => {
    expect(frame(0)).not.toBe(frame(1));
    expect(frame(0.5)).toBe(frame(0.5));
  });
});

describe('neofetch', () => {
  const info = terminalData(content, build).info;

  it('lists facts about me in order, with experience under the role', () => {
    expect(rows(info, NOW, '09:14').map((r) => [r.key, r.text])).toEqual([
      ['Role', 'Backend Engineer'],
      ['Uptime', '2+ years in software engineering'],
      ['Stack', 'Node.js, GCP'],
      ['Based', 'Buenos Aires, AR · 09:14 (GMT-3)'],
      ['Education', 'Sound Engineering, UNTREF'],
      ['Languages', 'Spanish (native), English (C1)'],
      ['Links', 'resume · github · linkedin'],
      ['Packages', '1 project, 1 post'],
    ]);
  });

  it('leaves out the clock on the server and rows without data', () => {
    const r = rows({ ...info, languages: undefined, careerStart: undefined, education: undefined }, NOW);
    expect(r.map((x) => x.key)).toEqual(['Role', 'Stack', 'Based', 'Links', 'Packages']);
    expect(r.find((x) => x.key === 'Based')?.text).toBe('Buenos Aires, AR');
  });

  it('says under a year for a new career', () => {
    expect(rows({ ...info, careerStart: '2026-06' }, NOW)[1].text).toBe('under a year in software engineering');
  });

  it('escapes content and links the resume', () => {
    const html = neofetchHTML({ ...info, role: '<b>Engineer</b>' }, NOW, 'art');
    expect(html).toContain('&lt;b&gt;Engineer&lt;/b&gt;');
    expect(html).toContain('<a href="/resume.pdf">resume</a>');
    expect(html).toContain('juan</span>@<span class="c-acc b">ubuntu');
  });
});

describe('line editor', () => {
  const history = ['curl /api/me', 'ls', 'curl /api/stack'];

  it('suggests the newest history match, then a common command', () => {
    expect(suggest('curl', history, [])).toBe(' /api/stack');
    expect(suggest('ne', history, ['neofetch'])).toBe('ofetch');
    expect(suggest('', history, ['help'])).toBe('');
    expect(suggest('ls', history, [])).toBe('');
  });

  it('steps through history filtered by the typed prefix and restores the draft', () => {
    const up = stepHistory(history, null, 'curl', -1)!;
    expect(up.value).toBe('curl /api/stack');
    const up2 = stepHistory(history, up.cursor, up.value, -1)!;
    expect(up2.value).toBe('curl /api/me');
    expect(stepHistory(history, up2.cursor, up2.value, -1)).toBeNull();
    const down = stepHistory(history, up2.cursor, up2.value, 1)!;
    expect(down.value).toBe('curl /api/stack');
    expect(stepHistory(history, down.cursor, down.value, 1)).toEqual({ cursor: null, value: 'curl' });
  });

  it('searches history backwards', () => {
    expect(searchHistory(history, 'api', 3)).toEqual({ index: 2, entry: 'curl /api/stack' });
    expect(searchHistory(history, 'api', 2)).toEqual({ index: 0, entry: 'curl /api/me' });
    expect(searchHistory(history, 'nope', 3)).toBeNull();
  });

  it('finds the word to complete in the last pipe stage', () => {
    expect(completionTarget('cat access.log | gr', 19)).toEqual({ words: ['gr'], cur: 'gr', start: 17 });
    expect(completionTarget('cd pro', 6)).toEqual({ words: ['cd', 'pro'], cur: 'pro', start: 3 });
  });

  it('tokenizes quotes, shares prefixes and catches typos', () => {
    expect(tokenize(`grep "unknown path" access.log`)).toEqual(['grep', 'unknown path', 'access.log']);
    expect(commonPrefix(['projects/', 'pwd'])).toBe('p');
    expect(closest('crul', ['cat', 'curl'])).toBe('curl');
    expect(closest('xyz', ['cat', 'curl'])).toBeUndefined();
  });
});

describe('commands', () => {
  it('help lists only commands', async () => {
    const { env } = makeEnv();
    const out = (await run('help', env)).text!;
    expect(out).toMatch(/^Commands\n/);
    expect(out).toContain('tail -f access.log');
    expect(out).not.toMatch(/keys|pipes|finger/i);
  });

  it('ls, cd and pwd walk the content as files', async () => {
    const { env } = makeEnv();
    expect((await run('ls', env)).text!.split('\n')).toEqual(['about.md', 'access.log', 'education', 'experience', 'now.json', 'projects', 'resume.pdf', 'stack.json', 'writing']);
    expect((await run('ls -a', env)).text).toContain('.bashrc');
    expect((await run('cd projects', env)).status ?? 0).toBe(0);
    expect((await run('pwd', env)).text).toBe('/home/juan/projects');
    expect((await run('ls', env)).text).toBe('relay.md');
    expect(await run('cd nowhere', env)).toEqual({ text: 'bash: cd: nowhere: No such file or directory', status: 1 });
    await run('cd ..', env);
    expect(env.cwd).toEqual([]);
  });

  it('cat prints content escaped and linkified', async () => {
    const { env } = makeEnv();
    const res = await run('cat projects/relay.md', env);
    expect(res.text).toContain('# Webhook <relay>');
    expect(toHTML(res)).toContain('Webhook &lt;relay&gt;');
    expect(toHTML(res)).toContain('<a href="https://github.com/x/relay"');
    expect((await run('cat resume.pdf', env)).status).toBe(1);
    expect((await run('cat now.json', env)).json).toEqual({ building: 'juanalmaraz.dev' });
  });

  it('pipes text through grep and JSON through jq', async () => {
    const { env } = makeEnv();
    const grep = await run('cat access.log | grep 404', env);
    expect(grep.text!.split('\n')).toHaveLength(1);
    expect(grep.text).toContain('404 · unknown path');
    expect((await run('cat access.log | wc -l', env)).text!.trim()).toBe('3');
    expect((await run('curl /api/me | jq .name', env)).text).toBe('"Juan Almaraz"');
    expect((await run('curl /api/me | jq -r .links.github', env)).text).toBe('https://github.com/almarazj');
  });

  it('curl shows real response headers with -i and refuses other hosts', async () => {
    const { env, requests } = makeEnv();
    const res = await run('curl -i juanalmaraz.dev/api/me', env);
    expect(requests).toEqual(['/api/me']);
    expect(res.text).toMatch(/^HTTP\/2 200\n/);
    expect(res.text).toContain('cache-control: public, s-maxage=60');
    expect((await run('curl /nope', env)).text).toBe('not found');
    expect(await run('curl example.com', env)).toEqual({ text: 'curl: (6) Could not resolve host: example.com', status: 6 });
  });

  it('unknown commands suggest a close one', async () => {
    const { env } = makeEnv();
    const res = await run('crul /api/me', env);
    expect(res.status).toBe(127);
    expect(res.text).toBe('crul: command not found');
    expect(res.html).toContain('did you mean curl?');
  });

  it('open goes to links, posts and sections', async () => {
    const { env, opened } = makeEnv();
    await run('open github', env);
    await run('open writing/hello.md', env);
    await run('open experience', env);
    expect(opened).toEqual(['https://github.com/almarazj', '/writing/hello', '/#experience']);
    expect((await run('open now.json', env)).status).toBe(1);
  });

  it('tail -f prints new log lines only while the terminal is live', async () => {
    vi.useFakeTimers();
    const entries = [...feed];
    const { env, requests } = makeEnv(entries);
    const res = await run('tail -f access.log', env);
    expect(res.text!.split('\n')).toHaveLength(3);
    const printed: string[] = [];
    let live = false;
    const stop = res.job!({ print: (h) => printed.push(h), live: () => live });
    requests.length = 0;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).toHaveLength(0);

    live = true;
    entries.push({ m: 'GET', p: '/writing', s: 200, c: 'warm', ms: 11, t: NOW.getTime() });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('/writing');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(printed).toHaveLength(1);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requests).toHaveLength(2);
  });

  it('git log shows the build this page came from', async () => {
    const { env } = makeEnv();
    expect((await run('git log', env)).text).toBe('commit abc1234 (HEAD -> main, tag: v1.2.0)');
  });

  it('completes commands, directories and API paths, never hidden commands', () => {
    const { env } = makeEnv();
    const values = (words: string[], cur: string) => candidates(env, words, cur).map((c) => c.value).filter((v) => v.startsWith(cur));
    expect(values(['cd', 'pro'], 'pro')).toEqual(['projects/']);
    expect(values(['curl', '/api/s'], '/api/s')).toEqual(['/api/stack', '/api/status']);
    expect(values(['f'], 'f')).toEqual([]);
    expect(Object.keys(COMMANDS)).toContain('finger');
  });
});

describe('terminalData', () => {
  it('derives neofetch facts and file links from content', () => {
    const { info, home } = terminalData(content, build);
    expect(info).toMatchObject({ role: 'Backend Engineer', stack: ['Node.js', 'GCP'], projects: 1, posts: 1, links: { resume: '/resume.pdf' } });
    const writing = home.c.writing;
    expect(writing.t === 'd' && writing.c['hello.md']).toMatchObject({ href: '/writing/hello' });
    const projects = home.c.projects;
    expect(projects.t === 'd' && projects.c['relay.md']).toMatchObject({ href: 'https://github.com/x/relay' });
  });
});
