import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown/render';

describe('renderMarkdown', () => {
  it('removes script tags', async () => {
    const { html } = await renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
  });
  it('drops javascript: hrefs', async () => {
    const { html } = await renderMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('href');
  });
  it('collects headings with slug ids', async () => {
    const { headings } = await renderMarkdown('## Batching to stay free');
    expect(headings).toEqual([{ id: 'h-batching-to-stay-free', text: 'Batching to stay free', depth: 2 }]);
  });
  it('highlights fenced code with Shiki', async () => {
    const { html } = await renderMarkdown('```ts\nconst a = 1;\n```');
    expect(html).toContain('shiki');
    expect(html).toContain('<span style=');
  });
  it('computes reading time', async () => {
    const { minutes } = await renderMarkdown(Array(440).fill('word').join(' '));
    expect(minutes).toBe(2);
  });
});

describe('renderMarkdown post chrome', () => {
  it('turns :::note into a callout', async () => {
    const { html } = await renderMarkdown(':::note\nHi\n:::');
    expect(html).toContain('<div class="callout">');
  });
  it('labels fenced code from title meta and adds a copy button', async () => {
    const { html } = await renderMarkdown('```ts title="a.ts"\nconst a = 1;\n```');
    expect(html).toContain('<span class="file">a.ts</span>');
    expect(html).toContain('data-copy');
  });
  it('adds heading anchors without polluting heading text or listing footnotes', async () => {
    const { html, headings } = await renderMarkdown('## One\n\ntext[^1]\n\n[^1]: note');
    expect(html).toContain('class="anchor"');
    expect(headings).toEqual([{ id: 'h-one', text: 'One', depth: 2 }]);
  });
  it('keeps prose that looks like a directive', async () => {
    for (const t of ['a:b', 'The key is posts:list here.']) {
      expect((await renderMarkdown(t)).html).toBe(`<p>${t}</p>`);
    }
  });
  it('keeps unknown container directives as text', async () => {
    const { html } = await renderMarkdown(':::danger\nkeep me\n:::');
    expect(html).toContain('keep me');
    expect(html).not.toContain('<div></div>');
  });
  it('keeps link text in the index and prefixes ids', async () => {
    const { headings, html } = await renderMarkdown('## Writing\n\n## Using [Shiki](https://shiki.style)');
    expect(headings.map((h) => h.text)).toEqual(['Writing', 'Using Shiki']);
    expect(headings[0].id).toBe('h-writing');
    expect(html).toContain('<h2 id="h-writing"');
  });
});
