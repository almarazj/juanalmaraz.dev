import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/release-check.sh');
const dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function commit(cwd: string, version: string) {
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version }));
  git(cwd, 'add', '.');
  git(cwd, 'commit', '--allow-empty', '-m', version);
}

// A clone of a bare origin whose main holds `version`, left at that commit.
function setup(version = '1.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'release-check-'));
  dirs.push(root);
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(work);
  git(root, 'init', '--bare', origin);
  git(work, 'init');
  git(work, 'remote', 'add', 'origin', origin);
  commit(work, version);
  git(work, 'push', 'origin', 'main');
  return work;
}

function run(cwd: string) {
  const r = spawnSync('bash', [script], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('release-check.sh', () => {
  it('passes and prints the tag when it matches package.json and the commit is on main', () => {
    const work = setup();
    git(work, 'tag', 'v1.2.3');
    const r = run(work);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('v1.2.3');
  });

  it('fails when the tag does not match package.json', () => {
    const work = setup('1.2.4');
    git(work, 'tag', 'v1.2.3');
    const r = run(work);
    expect(r.code).toBe(1);
    expect(r.err).toContain('tag v1.2.3 does not match package.json 1.2.4');
  });

  it('fails when the tagged commit is only on develop', () => {
    const work = setup();
    git(work, 'checkout', '-b', 'develop');
    commit(work, '1.2.3');
    git(work, 'tag', 'v1.2.3');
    const r = run(work);
    expect(r.code).toBe(1);
    expect(r.err).toContain('tagged commit is not on main');
  });

  it('fetches main when the clone lacks origin/main', () => {
    const work = setup();
    git(work, 'tag', 'v1.2.3');
    git(work, 'update-ref', '-d', 'refs/remotes/origin/main');
    expect(run(work).code).toBe(0);
  });

  it('fails when HEAD has no v* tag', () => {
    const work = setup();
    git(work, 'tag', 'other');
    const r = run(work);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no v* tag points at HEAD');
  });

  it('fails when HEAD has two v* tags', () => {
    const work = setup();
    git(work, 'tag', 'v1.2.3');
    git(work, 'tag', 'v1.2.4');
    const r = run(work);
    expect(r.code).toBe(1);
    expect(r.err).toContain('more than one v* tag points at HEAD');
  });
});
