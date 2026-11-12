import { FieldValue } from 'firebase-admin/firestore';
import type { z } from 'zod';
import { db } from '../firebase';
import { feedStats } from '../feed/stats';
import {
  AboutSchema, CertificateSchema, EducationSchema, ExperienceSchema, FeedEntrySchema, PostSchema, ProjectSchema, SiteSchema,
  type FeedEntry,
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

// Firestore content is untrusted at render time: a document that fails its schema is skipped, never rendered.
function parse<C extends Collection>(collection: C, id: string, data: unknown): Doc<C> | null {
  const result = schemas[collection].safeParse(data);
  if (!result.success) {
    console.error(`Skipping invalid ${collection}/${id}: ${result.error.message}`);
    return null;
  }
  return { ...(result.data as object), id } as Doc<C>;
}

const hasStatus = (c: Collection) => c === 'posts' || c === 'projects';
// shortcut: Firestore needs a composite index only for where+orderBy on different fields,
// so published items are sorted in memory (tiny collections).
const sortKey = (c: Collection) => (c === 'posts' ? 'publishedAt' : c === 'education' ? 'start' : 'order');

export async function listPublished<C extends Collection>(collection: C): Promise<Doc<C>[]> {
  const snap = hasStatus(collection)
    ? await db().collection(collection).where('status', '==', 'published').get()
    : await db().collection(collection).get();
  const key = sortKey(collection);
  const rows = snap.docs.map((d) => parse(collection, d.id, d.data())).filter((r) => r !== null);
  const dir = key === 'publishedAt' || key === 'start' ? -1 : 1;
  const value = (r: Doc<C>) => (r as Record<string, unknown>)[key] as string | number;
  rows.sort((a, b) => (value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0));
  return rows;
}

export async function getPublished<C extends Collection>(collection: C, id: string): Promise<Doc<C> | null> {
  const snap = await db().collection(collection).doc(id).get();
  if (!snap.exists) return null;
  const doc = parse(collection, snap.id, snap.data());
  if (doc && hasStatus(collection) && (doc as { status?: string }).status !== 'published') return null;
  return doc;
}

export async function getSingleton<P extends keyof typeof singletons>(path: P): Promise<z.infer<(typeof singletons)[P]>> {
  const snap = await db().doc(path).get();
  if (!snap.exists) throw new Error(`Missing singleton ${path}`);
  const result = singletons[path].safeParse(snap.data());
  if (!result.success) throw new Error(`Invalid singleton ${path}: ${result.error.message}`);
  return result.data as z.infer<(typeof singletons)[P]>;
}

// Singletons live at about/main and site/main and keep revisions like any other document.
export type Revisable = Collection | 'about' | 'site';

/** With `create`, the commit fails with ALREADY_EXISTS instead of overwriting. */
export async function saveWithRevision<T extends object>(
  collection: Revisable,
  id: string,
  data: T,
  savedBy: string,
  { create = false } = {},
): Promise<void> {
  const ref = db().collection(collection).doc(id);
  const batch = db().batch();
  if (create) batch.create(ref, data);
  else batch.set(ref, data);
  batch.set(ref.collection('revisions').doc(), { ...data, savedAt: FieldValue.serverTimestamp(), savedBy });
  await batch.commit();
}

/** Admin view: every document including drafts and ones failing their schema, unparsed. */
export async function listAll(collection: Revisable): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const snap = await db().collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

export async function getRaw(collection: Revisable, id: string): Promise<Record<string, unknown> | null> {
  const snap = await db().collection(collection).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

export interface Revision {
  id: string;
  savedAt: number;
  savedBy: string;
  data: Record<string, unknown>;
}

export async function listRevisions(collection: Revisable, id: string, limit = 20): Promise<Revision[]> {
  const snap = await db()
    .collection(collection).doc(id).collection('revisions')
    .orderBy('savedAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => {
    const { savedAt, savedBy, ...data } = d.data();
    return { id: d.id, savedAt: savedAt.toMillis(), savedBy, data };
  });
}

export async function restoreRevision(
  collection: Revisable,
  id: string,
  revisionId: string,
  savedBy: string,
): Promise<void> {
  const snap = await db().collection(collection).doc(id).collection('revisions').doc(revisionId).get();
  if (!snap.exists) throw new Error(`Missing revision ${revisionId}`);
  const data = { ...snap.data()! };
  delete data.savedAt;
  delete data.savedBy;
  await saveWithRevision(collection, id, data, savedBy);
}

export interface Feed {
  entries: FeedEntry[];
  updatedAt: number;
  stats: ReturnType<typeof feedStats>;
}
const FEED = 'public/feed';

// Invalid rows are skipped so one bad write cannot take the whole feed down.
export async function getFeed(): Promise<Feed> {
  const data = (await db().doc(FEED).get()).data();
  const entries = (Array.isArray(data?.entries) ? data.entries : []).flatMap((e: unknown) => {
    const r = FeedEntrySchema.safeParse(e);
    return r.success ? [r.data] : [];
  });
  const updatedAt = typeof data?.updatedAt === 'number' ? data.updatedAt : 0;
  return { entries, updatedAt, stats: feedStats(entries, updatedAt) };
}

export async function saveFeed(entries: FeedEntry[], now = Date.now()): Promise<void> {
  await db().doc(FEED).set({ entries, updatedAt: now, stats: feedStats(entries, now) });
}
