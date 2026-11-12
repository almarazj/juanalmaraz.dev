import { adminFetch } from './fetch';

// Browser side of the two-step upload: original straight to S3, then the app processes it.
export async function adminUpload(kind: 'image' | 'resume', file: File, extra: Record<string, string> = {}): Promise<Response> {
  const post = (data: object) =>
    adminFetch('/admin/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const presign = await post({ step: 'presign', kind });
  if (!presign.ok) return presign;
  const { url, fields, key } = await presign.json();
  const form = new FormData();
  for (const [name, value] of Object.entries<string>(fields)) form.set(name, value);
  form.set('file', file); // S3 requires the file to be the last field
  const stored = await fetch(url, { method: 'POST', body: form });
  if (!stored.ok) {
    const code = /<Code>(.*?)<\/Code>/.exec(await stored.text())?.[1];
    return Response.json({ error: code === 'EntityTooLarge' ? 'File too large' : `Storage rejected the upload (${stored.status})` }, { status: 400 });
  }
  return post({ step: 'process', kind, key, name: file.name, ...extra });
}
