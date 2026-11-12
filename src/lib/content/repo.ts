import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { config, ddb } from '../aws';
import {
  AboutSchema, CertificateSchema, EducationSchema, ExperienceSchema, PostSchema, ProjectSchema, SiteSchema,
} from './schemas';

const schemas = {
  posts: PostSchema,
  projects: ProjectSchema,
  experience: ExperienceSchema,
  education: EducationSchema,
  certificates: CertificateSchema,
};
const singletons = { 'about/main': AboutSchema, 'site/main': SiteSchema };

export type Collection = keyof typeof schemas;
export type Doc<C extends Collection> = z.infer<(typeof schemas)[C]> & { id: string };

// Stored content is untrusted at render time: a document that fails its schema is skipped, never rendered.
function parse<C extends Collection>(collection: C, id: string, data: unknown): Doc<C> | null {
  const result = schemas[collection].safeParse(data);
  if (!result.success) {
    console.error(`Skipping invalid ${collection}/${id}: ${result.error.message}`);
    return null;
  }
  return { ...(result.data as object), id } as Doc<C>;
}

const hasStatus = (c: Collection) => c === 'posts' || c === 'projects';
// shortcut: no index, published items are sorted in memory (tiny collections).
const sortKey = (c: Collection) => (c === 'posts' ? 'publishedAt' : c === 'education' ? 'start' : 'order');

const strip = (item: Record<string, unknown>) => {
  const data = { ...item };
  for (const k of ['pk', 'sk', 'expiresAt']) delete data[k];
  return data;
};

async function queryAll(pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb().send(new QueryCommand({
      TableName: config().table,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const getItem = async (pk: string, sk: string) =>
  (await ddb().send(new GetCommand({ TableName: config().table, Key: { pk, sk } }))).Item;

export async function listPublished<C extends Collection>(collection: C): Promise<Doc<C>[]> {
  const items = await queryAll(collection);
  const key = sortKey(collection);
  const rows = items
    .filter((i) => !hasStatus(collection) || i.status === 'published')
    .map((i) => parse(collection, i.sk as string, strip(i)))
    .filter((r) => r !== null);
  const dir = key === 'publishedAt' || key === 'start' ? -1 : 1;
  const value = (r: Doc<C>) => (r as Record<string, unknown>)[key] as string | number;
  rows.sort((a, b) => (value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0));
  return rows;
}

export async function getPublished<C extends Collection>(collection: C, id: string): Promise<Doc<C> | null> {
  const item = await getItem(collection, id);
  if (!item) return null;
  const doc = parse(collection, id, strip(item));
  if (doc && hasStatus(collection) && (doc as { status?: string }).status !== 'published') return null;
  return doc;
}

export async function getSingleton<P extends keyof typeof singletons>(path: P): Promise<z.infer<(typeof singletons)[P]>> {
  const [pk, sk] = path.split('/') as [string, string];
  const item = await getItem(pk, sk);
  if (!item) throw new Error(`Missing singleton ${path}`);
  const result = singletons[path].safeParse(strip(item));
  if (!result.success) throw new Error(`Invalid singleton ${path}: ${result.error.message}`);
  return result.data as z.infer<(typeof singletons)[P]>;
}

// Singletons live at about/main and site/main and keep revisions like any other document.
export type Revisable = Collection | 'about' | 'site';
const docId = (collection: Revisable, id: string) => (collection === 'about' || collection === 'site' ? 'main' : id);

// DynamoDB caps an item at 400 KB; the rest is headroom for the revision's extra fields.
export const MAX_DOC_BYTES = 350 * 1024;
export class AlreadyExistsError extends Error {}
export class DocumentTooLargeError extends Error {}

let lastRevisionMs = 0;
// Strictly increasing within a process so revisions saved in the same millisecond still sort in save order.
const revisionKey = () => {
  lastRevisionMs = Math.max(Date.now(), lastRevisionMs + 1);
  return { savedAt: lastRevisionMs, sk: `${new Date(lastRevisionMs).toISOString()}#${randomBytes(3).toString('hex')}` };
};

/** With `create`, an existing document throws AlreadyExistsError instead of being overwritten. */
export async function saveWithRevision<T extends object>(
  collection: Revisable,
  id: string,
  data: T,
  savedBy: string,
  { create = false } = {},
): Promise<void> {
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_DOC_BYTES) throw new DocumentTooLargeError('Document too large');
  const TableName = config().table;
  const rev = revisionKey();
  try {
    await ddb().send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName,
            Item: { ...data, pk: collection, sk: docId(collection, id) },
            ...(create ? { ConditionExpression: 'attribute_not_exists(pk)' } : {}),
          },
        },
        { Put: { TableName, Item: { ...data, pk: `rev#${collection}#${id}`, sk: rev.sk, savedAt: rev.savedAt, savedBy } } },
      ],
    }));
  } catch (err) {
    if (create && err instanceof TransactionCanceledException && err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') {
      throw new AlreadyExistsError(`${collection}/${id} already exists`);
    }
    throw err;
  }
}

/** Admin view: every document including drafts and ones failing their schema, unparsed. */
export async function listAll(collection: Revisable): Promise<{ id: string; data: Record<string, unknown> }[]> {
  return (await queryAll(collection)).map((i) => ({ id: i.sk as string, data: strip(i) }));
}

export async function getRaw(collection: Revisable, id: string): Promise<Record<string, unknown> | null> {
  const item = await getItem(collection, docId(collection, id));
  return item ? strip(item) : null;
}

export interface Revision {
  id: string;
  savedAt: number;
  savedBy: string;
  data: Record<string, unknown>;
}

export async function listRevisions(collection: Revisable, id: string, limit = 20): Promise<Revision[]> {
  const out = await ddb().send(new QueryCommand({
    TableName: config().table,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `rev#${collection}#${id}` },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (out.Items ?? []).map((i) => {
    const { savedAt, savedBy, ...data } = strip(i);
    return { id: i.sk as string, savedAt: savedAt as number, savedBy: savedBy as string, data };
  });
}

export async function restoreRevision(
  collection: Revisable,
  id: string,
  revisionId: string,
  savedBy: string,
): Promise<void> {
  const item = await getItem(`rev#${collection}#${id}`, revisionId);
  if (!item) throw new Error(`Missing revision ${revisionId}`);
  const data = strip(item);
  delete data.savedAt;
  delete data.savedBy;
  await saveWithRevision(collection, id, data, savedBy);
}
