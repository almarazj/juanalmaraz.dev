import rehypeShiki from '@shikijs/rehype';
import type { Element, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

export interface Heading { id: string; text: string; depth: 2 | 3 }

// Graphite tokens from docs/design.md
const graphite = {
  name: 'graphite',
  type: 'dark' as const,
  fg: '#eceef1',
  bg: '#3a3f46',
  settings: [
    { settings: { foreground: '#eceef1' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#b4bac3', fontStyle: 'italic' } },
    { scope: ['string', 'keyword', 'storage', 'constant.language'], settings: { foreground: '#ffb15c' } },
    { scope: ['entity.name.function', 'support.function', 'entity.name.type'], settings: { foreground: '#a9c1ff' } },
    { scope: ['constant.numeric', 'variable.other.constant'], settings: { foreground: '#7fe0a8' } },
  ],
};

// :::note ... ::: becomes <div class="callout">; every other directive is put back as its source text
// so prose like "posts:list" is never swallowed.
const remarkCallouts = () => (tree: MdastNode, file: { value: unknown }) => {
  const src = String(file.value);
  const walk = (n: MdastNode) => {
    n.children = n.children?.map((c) => {
      if (c.type === 'containerDirective' && c.name === 'note') {
        c.data = { hName: 'div', hProperties: { className: ['callout'] } };
        return c;
      }
      if (/^(text|leaf|container)Directive$/.test(c.type) && c.position) {
        const value = src.slice(c.position.start.offset, c.position.end.offset);
        return c.type === 'textDirective'
          ? { type: 'text', value }
          : { type: 'paragraph', children: [{ type: 'text', value }] };
      }
      return c;
    });
    n.children?.forEach(walk);
  };
  walk(tree);
};
interface MdastNode {
  type: string;
  name?: string;
  value?: string;
  data?: object;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MdastNode[];
}

// Runs after sanitize so the markup it adds (copy buttons, anchors) is trusted output.
const rehypeChrome = () => (tree: Root) => {
  const walk = (n: Root | Element): void => {
    n.children.forEach((c, i) => {
      // Shiki leaves a nested root where the code block was.
      if ((c.type as string) === 'root') return walk(c as unknown as Root);
      if (c.type !== 'element') return;
      if (c.tagName === 'pre') {
        const title = c.properties['dataTitle'];
        const bar: Element = {
          type: 'element', tagName: 'div', properties: { className: ['bar'] },
          children: [
            { type: 'element', tagName: 'span', properties: { className: ['file'] }, children: typeof title === 'string' ? [{ type: 'text', value: title }] : [] },
            { type: 'element', tagName: 'button', properties: { type: 'button', dataCopy: '' }, children: [{ type: 'text', value: 'Copy' }] },
          ],
        };
        n.children[i] = { type: 'element', tagName: 'div', properties: { className: ['codeblock'] }, children: [bar, c] };
        return;
      }
      if ((c.tagName === 'h2' || c.tagName === 'h3') && typeof c.properties.id === 'string' && c.properties.id !== 'footnote-label') {
        if (c.tagName === 'h2') c.properties.dataSpyEntry = '';
        // The anchor is a sibling, not a child, so it never changes the heading's accessible name.
        const anchor: Element = {
          type: 'element', tagName: 'a',
          properties: { className: ['anchor'], href: `#${c.properties.id}`, ariaLabel: `Link to ${toString(c)}` },
          children: [{ type: 'text', value: '#' }],
        };
        n.children[i] = { type: 'element', tagName: 'div', properties: { className: ['hwrap'] }, children: [c, anchor] };
        return;
      }
      walk(c);
    });
  };
  walk(tree);
};

const keep = (tag: string, extra: string[]) => [...(defaultSchema.attributes?.[tag] ?? []), ...extra];
const schema = {
  ...defaultSchema,
  clobberPrefix: '', // keep rehype-slug ids so TOC anchors work
  attributes: {
    ...defaultSchema.attributes,
    div: keep('div', ['className']),
    span: keep('span', ['className', 'class', 'style']),
    pre: keep('pre', ['className', 'class', 'style', 'tabIndex', 'tabindex', 'dataTitle']),
    code: keep('code', ['className', 'class']),
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkCallouts)
  .use(remarkRehype)
  .use(rehypeSlug, { prefix: 'h-' }) // keeps author headings from duplicating page ids like #writing
  .use(rehypeShiki, {
    theme: graphite,
    transformers: [
      {
        pre(node) {
          const title = /title="([^"]*)"/.exec(this.options.meta?.__raw ?? '')?.[1];
          if (title) node.properties['dataTitle'] = title;
        },
      },
    ],
  })
  .use(rehypeSanitize, schema)
  .use(rehypeChrome)
  .use(rehypeStringify);

function collectHeadings(tree: Root): Heading[] {
  const out: Heading[] = [];
  const walk = (n: Root | Element) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      if ((c.tagName === 'h2' || c.tagName === 'h3') && typeof c.properties.id === 'string' && c.properties.id !== 'footnote-label') {
        out.push({ id: c.properties.id, text: toString(c), depth: c.tagName === 'h2' ? 2 : 3 });
      }
      walk(c);
    }
  };
  walk(tree);
  return out;
}

export const readingMinutes = (md: string) => Math.ceil(md.trim().split(/\s+/).filter(Boolean).length / 220);

export async function renderMarkdown(md: string) {
  const tree = (await processor.run(processor.parse(md), md)) as Root;
  return { html: processor.stringify(tree), headings: collectHeadings(tree), minutes: readingMinutes(md) };
}
