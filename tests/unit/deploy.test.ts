import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const script = resolve('scripts/deploy.sh');
const dirs: string[] = [];

// The stub `aws` logs each call and answers the few queries deploy.sh reads.
function run(verify: string) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-'));
  dirs.push(dir);
  const log = join(dir, 'calls');
  const aws = join(dir, 'aws');
  writeFileSync(
    aws,
    `#!/usr/bin/env bash
echo "$*" >> "${log}"
case "$*" in
  "lambda publish-version"*) echo 8 ;;
  "lambda get-alias"*) echo 7 ;;
  "cloudfront create-invalidation"*) echo INV ;;
esac
`,
  );
  chmodSync(aws, 0o755);
  const r = spawnSync('bash', [script, 'repo:v1', 'bash', '-c', verify], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FUNCTION_NAME: 'fn', DISTRIBUTION_ID: 'dist' },
  });
  return { code: r.status, calls: readFileSync(log, 'utf8').trim().split('\n') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

it('moves live to the new version and keeps it when verification passes', () => {
  const r = run('true');
  expect(r.code).toBe(0);
  expect(r.calls.filter((c) => c.startsWith('lambda update-alias'))).toHaveLength(1);
  expect(r.calls.join('\n')).toContain('--function-version 8');
});

it('points live back to the previous version and invalidates again when verification fails', () => {
  const r = run('false');
  expect(r.code).not.toBe(0);
  const aliases = r.calls.filter((c) => c.startsWith('lambda update-alias'));
  expect(aliases).toHaveLength(2);
  expect(aliases[1]).toContain('--function-version 7');
  expect(r.calls.filter((c) => c.startsWith('cloudfront create-invalidation'))).toHaveLength(2);
});
