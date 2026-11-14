import { describe, expect, it } from 'vitest';
import { migrateProject } from '../../scripts/migrate-projects';

const base = { title: 'T', year: 2022, summary: 's', links: [], confidential: false, order: 1, status: 'published' };

describe('migrateProject', () => {
  it('turns a backend project into Backend, folding problem/decision/result into the body', () => {
    const out = migrateProject({ ...base, group: 'backend', stack: ['Node.js'], problem: 'Slow.', decision: '', result: 'Fast.' })!;
    expect(out.doc).toMatchObject({ context: 'Personal', live: false, domains: ['Backend'], stack: ['Node.js'], bodyMd: '## Problem\n\nSlow.\n\n## Result\n\nFast.' });
    expect(out.doc).not.toHaveProperty('group');
    expect(out.doc).not.toHaveProperty('problem');
    expect(out.guessed).toEqual(['context']);
  });

  it('moves domain tags out of an engineering stack and marks confidential work as Client', () => {
    const out = migrateProject({ ...base, group: 'engineering', stack: ['Python', 'Acoustics', 'Arduino'], confidential: true })!;
    expect(out.doc).toMatchObject({ context: 'Client', domains: ['Acoustics', 'Electronics'], stack: ['Python', 'Arduino'] });
    expect(out.doc).not.toHaveProperty('bodyMd');
  });

  it('guesses a domain when the stack names none, and skips migrated documents', () => {
    const out = migrateProject({ ...base, group: 'engineering', stack: [] })!;
    expect(out.doc).toMatchObject({ context: 'Academic', domains: ['DSP'] });
    expect(out.guessed).toEqual(['context', 'domains']);
    expect(migrateProject(out.doc)).toBeNull();
  });
});
