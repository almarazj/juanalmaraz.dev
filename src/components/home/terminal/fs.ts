export type FileKind = 'md' | 'txt' | 'json' | 'log' | 'pdf';
export interface FileNode {
  t: 'f';
  kind: FileKind;
  body?: string;
  json?: unknown;
  /** Where `open` takes the visitor. */
  href?: string;
}
export interface DirNode {
  t: 'd';
  c: Record<string, FsNode>;
  href?: string;
}
export type FsNode = FileNode | DirNode;

export const HOME = '/home/juan';
export const pathLabel = (path: readonly string[]) => '~' + (path.length ? `/${path.join('/')}` : '');
export const absPath = (path: readonly string[]) => HOME + (path.length ? `/${path.join('/')}` : '');

/** Resolves `p` against `cwd`; `/` and `~` both mean home, and `..` stops there. */
export function resolve(home: DirNode, cwd: readonly string[], p = ''): { node: FsNode; path: string[] } | null {
  const path = p.startsWith('~') || p.startsWith('/') ? [] : [...cwd];
  for (const seg of p.replace(/^~/, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') path.pop();
    else path.push(seg);
  }
  let node: FsNode = home;
  for (const seg of path) {
    if (node.t !== 'd' || !Object.hasOwn(node.c, seg)) return null;
    node = node.c[seg];
  }
  return { node, path };
}

/** Bytes as `ls -l` shows them, or null when unknown (the resume lives elsewhere). */
export function nodeSize(n: FsNode): number | null {
  if (n.t === 'd') return 4096;
  if (n.body != null) return new TextEncoder().encode(n.body).length;
  if (n.json !== undefined) return JSON.stringify(n.json, null, 2).length;
  return null;
}
