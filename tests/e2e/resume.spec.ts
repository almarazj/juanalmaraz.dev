import { expect, test } from '@playwright/test';
import { bucket } from '../../src/lib/firebase';

test('/resume.pdf serves the PDF', async ({ request }) => {
  const res = await request.get('/resume.pdf');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect(res.headers()['content-disposition']).toBe('inline; filename="juan-almaraz-resume.pdf"');
});

test('/resume.pdf is the styled 404 when the object is missing', async ({ request }) => {
  const file = bucket().file('resume/juan-almaraz.pdf');
  const [data] = await file.download();
  await file.delete();
  try {
    const res = await request.get('/resume.pdf');
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain('This page does not exist.');
  } finally {
    await file.save(data, { contentType: 'application/pdf' });
  }
});
