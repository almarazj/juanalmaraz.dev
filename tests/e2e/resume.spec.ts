import { expect, test } from '@playwright/test';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config, s3 } from '../../src/lib/aws';

test('/resume.pdf serves the PDF', async ({ request }) => {
  const res = await request.get('/resume.pdf');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect(res.headers()['content-disposition']).toBe('inline; filename="juan-almaraz-resume.pdf"');
});

test('/resume.pdf is the styled 404 when the object is missing', async ({ request }) => {
  const Key = 'files/resume/juan-almaraz.pdf';
  const Bucket = config().bucket;
  const data = Buffer.from(await (await s3().send(new GetObjectCommand({ Bucket, Key }))).Body!.transformToByteArray());
  await s3().send(new DeleteObjectCommand({ Bucket, Key }));
  try {
    const res = await request.get('/resume.pdf');
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain('This page does not exist.');
  } finally {
    await s3().send(new PutObjectCommand({ Bucket, Key, Body: data, ContentType: 'application/pdf' }));
  }
});
