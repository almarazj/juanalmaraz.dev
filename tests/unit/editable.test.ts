import { describe, expect, it } from 'vitest';
import { fieldsOf, fromForm, toFormValue, validate } from '../../src/lib/content/editable';

const field = (c: Parameters<typeof fieldsOf>[0], name: string) => fieldsOf(c).find((f) => f.name === name)!;

describe('editable content', () => {
  it('derives editor fields from the schema and hides server-owned ones', () => {
    const post = fieldsOf('posts');
    expect(post.map((f) => f.name)).not.toContain('publishedAt');
    expect(field('posts', 'bodyMd').kind).toBe('markdown');
    expect(field('posts', 'status')).toMatchObject({ kind: 'select', options: ['draft', 'published'] });
    expect(field('posts', 'tags').kind).toBe('list');
    expect(field('posts', 'series')).toMatchObject({ kind: 'json', optional: true });
    expect(field('experience', 'end')).toMatchObject({ kind: 'text', nullable: true });
    expect(field('experience', 'url')).toMatchObject({ kind: 'text', optional: true });
    expect(field('experience', 'highlights').kind).toBe('textarea');
    expect(field('experience', 'logo')).toMatchObject({ kind: 'json', optional: true });
    expect(field('projects', 'confidential').kind).toBe('checkbox');
    expect(fieldsOf('site').map((f) => f.name)).not.toContain('resumePath');
  });

  it('round-trips a document through the form', () => {
    const doc = { title: 'T', summary: 'S', bodyMd: '# H\n\n  code', tags: ['a', 'b'], status: 'draft', series: { id: 's', title: 'S', part: 1 } };
    const fields = fieldsOf('posts');
    const values = Object.fromEntries(fields.map((f) => [f.name, toFormValue(f, (doc as Record<string, unknown>)[f.name])]));
    const { data, errors } = fromForm(fields, values);
    expect(errors).toEqual({});
    expect(data).toEqual(doc);
    expect(validate('posts', data).ok).toBe(true);
  });

  it('maps empty optional and nullable fields to undefined and null', () => {
    const { data } = fromForm([field('posts', 'series'), field('experience', 'end')], { series: '', end: ' ' });
    expect(data).toEqual({ series: undefined, end: null });
  });

  it('reports unreadable fields and schema issues per field', () => {
    const { errors } = fromForm([field('projects', 'year'), field('projects', 'links')], { year: 'abc', links: '{' });
    expect(errors).toEqual({ year: 'Enter a number', links: 'Invalid JSON' });
    expect(fromForm([field('projects', 'order')], { order: '' }).errors).toEqual({ order: 'Required' });

    const result = validate('posts', { title: '', summary: 's', bodyMd: '', tags: [], status: 'live', series: { id: 1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['series', 'status', 'title']);
      expect(result.errors.series).toMatch(/^id: /);
    }
  });
});
