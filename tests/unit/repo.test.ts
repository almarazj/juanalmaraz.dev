import { beforeEach, describe, expect, it } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { config, ddb } from '../../src/lib/aws';
import {
  AlreadyExistsError, DocumentTooLargeError, getRaw, listPublished, listRevisions, restoreRevision, saveWithRevision,
} from '../../src/lib/content/repo';
import { resetTable } from '../../scripts/local-aws';

const put = (pk: string, sk: string, item: object) =>
  ddb().send(new PutCommand({ TableName: config().table, Item: { pk, sk, ...item } }));

const post = (title: string, status: 'draft' | 'published', publishedAt = 1) => ({
  title, summary: 's', bodyMd: 'b', tags: [], status, publishedAt, updatedAt: publishedAt,
});

beforeEach(resetTable);

describe('repo', () => {
  it('saveWithRevision creates exactly one revision per call', async () => {
    await saveWithRevision('posts', 'a', post('A', 'draft'), 'me');
    expect(await listRevisions('posts', 'a')).toHaveLength(1);
    await saveWithRevision('posts', 'a', post('A2', 'draft'), 'me');
    expect(await listRevisions('posts', 'a')).toHaveLength(2);
  });

  it('saveWithRevision with create refuses to overwrite an existing document', async () => {
    await saveWithRevision('posts', 'c', post('C', 'draft'), 'me', { create: true });
    await expect(saveWithRevision('posts', 'c', post('C2', 'draft'), 'me', { create: true })).rejects.toThrow(AlreadyExistsError);
    expect(await listRevisions('posts', 'c')).toHaveLength(1);
    expect((await getRaw('posts', 'c'))?.title).toBe('C');
  });

  it('rejects a document over the size limit before writing anything', async () => {
    const big = { ...post('big', 'draft'), bodyMd: 'x'.repeat(351 * 1024) };
    await expect(saveWithRevision('posts', 'big', big, 'me')).rejects.toThrow(DocumentTooLargeError);
    expect(await listRevisions('posts', 'big')).toEqual([]);
    expect(await getRaw('posts', 'big')).toBeNull();
  });

  it('listRevisions returns the newest first, up to the limit', async () => {
    for (const t of ['1', '2', '3']) await saveWithRevision('posts', 'r', post(t, 'draft'), 'me');
    const revs = await listRevisions('posts', 'r', 2);
    expect(revs.map((r) => r.data.title)).toEqual(['3', '2']);
  });

  it('saves documents with explicitly undefined optional fields', async () => {
    await saveWithRevision('posts', 'u', { ...post('U', 'draft'), series: undefined }, 'me');
    expect(await listRevisions('posts', 'u')).toHaveLength(1);
  });

  it('listPublished excludes drafts and orders by publishedAt desc', async () => {
    await saveWithRevision('posts', 'old', post('old', 'published', 1), 'me');
    await saveWithRevision('posts', 'new', post('new', 'published', 2), 'me');
    await saveWithRevision('posts', 'd', post('d', 'draft', 3), 'me');
    const list = await listPublished('posts');
    expect(list.map((p) => p.title)).toEqual(['new', 'old']);
  });

  it('listPublished skips documents that fail their schema', async () => {
    const cert = { name: 'C', issuer: 'I', year: 2025, order: 1 };
    await put('certificates', 'good', { ...cert, verifyUrl: 'https://example.com/' });
    await put('certificates', 'bad', { ...cert, order: 2, verifyUrl: 'javascript:alert(1)' });
    const list = await listPublished('certificates');
    expect(list.map((c) => c.id)).toEqual(['good']);
  });

  it('restoreRevision writes the snapshot back and adds a revision', async () => {
    await saveWithRevision('posts', 'a', post('first', 'published'), 'me');
    await saveWithRevision('posts', 'a', post('second', 'published'), 'me');
    const revs = await listRevisions('posts', 'a');
    const first = revs.find((r) => r.data.title === 'first')!;
    await restoreRevision('posts', 'a', first.id, 'me');
    expect((await getRaw('posts', 'a'))?.title).toBe('first');
    expect(await listRevisions('posts', 'a')).toHaveLength(3);
  });
});
