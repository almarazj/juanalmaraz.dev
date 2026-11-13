// Seeds local DynamoDB and S3. SAMPLE-ONLY values are marked; replace real content via /admin.
import { putEntry } from '../src/lib/feed/store';
import { saveWithRevision, type Collection } from '../src/lib/content/repo';
import {
  AboutSchema, CertificateSchema, EducationSchema, ExperienceSchema,
  FeedEntrySchema, PostSchema, ProjectSchema, SiteSchema,
} from '../src/lib/content/schemas';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config, s3 } from '../src/lib/aws';
import { processImage } from '../src/lib/images/process';
import { readFile } from 'node:fs/promises';
import type { ZodType } from 'zod';

process.env.AWS_ENDPOINT_URL_DYNAMODB ??= 'http://localhost:8000';
process.env.AWS_ENDPOINT_URL_S3 ??= 'http://localhost:9000';

// SAMPLE-ONLY: stand-in images copied from the old site.
const oldSite = new URL('../tests/fixtures/images/', import.meta.url).pathname;
const img = (file: string, base: string, alt: string) => readFile(oldSite + file).then((b) => processImage(b, base, alt));
const [rirGui, pv, render, mpu, profile] = await Promise.all([
  img('rir-gui.png', 'projects/rir-gui', 'Impulse response analysis GUI'),
  img('pv.png', 'projects/pv', 'Phase vocoder block diagram'),
  img('render.png', 'projects/render', 'Render of the compressor enclosure'),
  img('mpu6050.jpg', 'projects/mpu6050', 'MPU6050 accelerometer on a test rig'),
  img('profile-img.png', 'about/profile', 'Juan Almaraz'),
]);

// SAMPLE-ONLY: a minimal one-page PDF so /resume.pdf works in e2e.
const stream = 'BT /F1 18 Tf 72 720 Td (SAMPLE-ONLY resume) Tj ET';
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets = objs.map((o, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await s3().send(new PutObjectCommand({ Bucket: config().bucket, Key: 'files/resume/juan-almaraz.pdf', Body: pdf, ContentType: 'application/pdf' }));

const now = Date.UTC(2026, 10, 1);
const by = 'seed';

async function put<T extends object>(c: Collection, id: string, schema: ZodType<T>, data: unknown) {
  await saveWithRevision(c, id, schema.parse(data), by);
}

// SAMPLE-ONLY: "Current company" and all dates, summaries and stacks below are placeholders.
const experience = [
  { id: 'backend-engineer', role: 'Backend Engineer', org: 'Current company', monogram: 'CC', start: '2024-04', end: null, place: 'Buenos Aires, AR', summary: 'Builds APIs and data pipelines in Node.js on GCP.', stack: ['Node.js', 'TypeScript', 'GCP'], order: 1 },
  { id: 'untref-ta', role: 'Teaching Assistant', org: 'UNTREF', monogram: 'UN', start: '2021-03', end: '2022-12', place: 'Buenos Aires, AR', summary: 'Assisted audio and signal processing courses.', stack: ['Audio', 'Signal processing'], order: 2 },
  { id: 'hospital-modelo', role: 'Administrative staff', org: 'Hospital Privado Modelo', monogram: 'HM', start: '2019-01', end: '2024-03', place: 'Buenos Aires, AR', summary: 'Administrative work while studying.', stack: [], order: 3 },
];

// SAMPLE-ONLY: project copy is placeholder.
const project = (title: string, group: 'backend' | 'engineering', year: number, order: number, extra: object = {}) => ({
  title, group, year, summary: `${title} (sample summary).`, stack: [], links: [], confidential: false, order, status: 'published', ...extra,
});
const projects = [
  ['juanalmaraz-dev', project('juanalmaraz.dev', 'backend', 2026, 1, { stack: ['Astro', 'DynamoDB', 'Lambda'], links: [{ label: 'Source', url: 'https://github.com/almarazj/juanalmaraz.dev' }] })],
  ['document-ingestion', project('Document ingestion pipeline', 'backend', 2025, 2, { confidential: true, stack: ['Node.js', 'SQS', 'Postgres'] })],
  ['webhook-relay', project('Webhook relay', 'backend', 2025, 3, { stack: ['Node.js', 'SNS'] })],
  ['room-impulse-response', project('Room impulse response tool', 'engineering', 2023, 4, { stack: ['Python', 'Acoustics'], image: rirGui })],
  ['phase-vocoder', project('Phase vocoder time-stretching', 'engineering', 2022, 5, { stack: ['Python', 'DSP'], image: pv })],
  ['compressor-hardware', project('Compressor hardware design', 'engineering', 2022, 6, { stack: ['Electronics'], image: render })],
  ['vibration-isolation', project('Vibration isolation system', 'engineering', 2021, 7, { stack: ['Arduino', 'Sensors'], image: mpu })],
] as const;

const education = [
  { id: 'sound-engineering', title: 'Sound Engineering', school: 'UNTREF', start: '2016-03', end: '2024-03', summary: 'Degree in sound engineering.' },
];

const cert = (name: string, issuer: string, year: number, order: number, level?: string, verifyUrl?: string) =>
  ({ name, issuer, year, order, ...(level && { level }), ...(verifyUrl && { verifyUrl }) });
// SAMPLE-ONLY: the EF SET verifyUrl is a placeholder for the real certificate link.
const certificates = [
  ['ef-set', cert('EF SET English Certificate', 'EF SET', 2025, 1, 'C1', 'https://www.efset.org/')],
  ['ibm-python-data-science', cert('Python for Data Science', 'IBM', 2023, 2)],
  ['ibm-data-analysis', cert('Data Analysis with Python', 'IBM', 2023, 3)],
  ['ibm-data-viz', cert('Data Visualization with Python', 'IBM', 2023, 4)],
  ['datacamp-ml', cert('Machine Learning Fundamentals', 'DataCamp', 2022, 5)],
  ['fcc-scientific-python', cert('Scientific Computing with Python', 'freeCodeCamp', 2022, 6)],
  ['dante-1-2', cert('Dante Level 1 and 2', 'Audinate', 2021, 7)],
] as const;

const about = {
  bio: 'I grew up in Buenos Aires. I spent more than ten years as a boy scout and played in a metal band as a teenager. I studied sound engineering, then moved into backend. I still play football every week and support Boca.',
  // SAMPLE-ONLY: stand-in photos until the owner uploads real ones.
  photos: [
    { image: profile, caption: 'Buenos Aires' },
    { image: mpu, caption: 'Lab days' },
    { image: render, caption: 'Side project' },
  ],
  questions: [
    { q: 'Recommend a book', a: 'Ficciones', detail: 'Jorge Luis Borges', icon: 'book' },
    { q: 'Recommend a film', a: 'Martin (Hache)', detail: 'Adolfo Aristarain, 1997', icon: 'film', link: 'https://letterboxd.com/film/martin-h/' },
    { q: 'What are you listening to?', a: 'Havok', detail: 'Thrash metal', icon: 'music' },
    { q: 'What are you reading?', a: 'Designing Data-Intensive Applications', detail: 'Martin Kleppmann', icon: 'book-open' },
    { q: 'Which club?', a: 'Boca Juniors', detail: 'Buenos Aires', icon: 'flag' },
    { q: 'Do you play?', a: 'Football', detail: 'Every week', icon: 'ball' },
  ],
};

const site = {
  roleLine: 'Backend Engineer · Node.js · GCP',
  lede: 'I build APIs and data pipelines. Before software I studied sound engineering, so I still think about systems as signals.',
  resumePath: 'files/resume/juan-almaraz.pdf',
  photo: profile,
  now: { building: 'juanalmaraz.dev', reading: 'Designing Data-Intensive Applications' },
  languages: 'Spanish (native), English (C1)',
  careerStart: '2024-04',
};

// SAMPLE-ONLY: post bodies are placeholders.
const filler = (n: number) => Array(n).fill('A sentence of sample prose that only exists to give the page some length.').join(' ');
const post2Body = `## Batching to stay free

${filler(6)}

\`\`\`ts title="logger.ts"
const batch: string[] = [];
export const log = (line: string) => batch.push(line);
\`\`\`

:::note
Sample callout: the free tier counts writes, not requests.
:::

${filler(6)}

## Reading it back

${filler(9)}[^1]

${filler(9)}

[^1]: Sample footnote text.

## Closing

${filler(10)}
`;
const posts = [
  ['terraform-one-person', { title: 'Terraform for a one-person project', summary: 'Why a solo site still gets infrastructure as code.', bodyMd: `## Why bother\n\n${filler(8)}\n`, tags: ['terraform'], status: 'published', publishedAt: now - 86_400_000 * 7, updatedAt: now, series: { id: 'building-site', title: 'Building juanalmaraz.dev', part: 1 } }],
  ['live-request-log', { title: 'A live request log on the GCP free tier', summary: 'How the hero terminal tails real traffic without leaving the free tier.', bodyMd: post2Body, tags: ['aws', 'dynamodb'], status: 'published', publishedAt: now, updatedAt: now, series: { id: 'building-site', title: 'Building juanalmaraz.dev', part: 2 } }],
  ['draft-post', { title: 'Draft post', summary: 'Work in progress.', bodyMd: 'Sample draft.', tags: [], status: 'draft', publishedAt: now, updatedAt: now }],
] as const;

for (const e of experience) { const { id, ...d } = e; await put('experience', id, ExperienceSchema, d); }
for (const [id, d] of projects) await put('projects', id, ProjectSchema, d);
for (const e of education) { const { id, ...d } = e; await put('education', id, EducationSchema, d); }
for (const [id, d] of certificates) await put('certificates', id, CertificateSchema, d);
for (const [id, d] of posts) await put('posts', id, PostSchema, d);
await saveWithRevision('about', 'main', AboutSchema.parse(about), by);
await saveWithRevision('site', 'main', SiteSchema.parse(site), by);
// SAMPLE-ONLY: fake traffic so the hero tail has rows before real logs arrive; times are relative to seeding.
const at = Date.now();
const feed = [
  ['GET', '/', 200, 'warm', 12, 4],
  ['GET', '/api/me', 200, 'warm', 9, 11],
  ['GET', '/writing/live-request-log', 200, 'cold', 184, 26],
  ['GET', '/api/now', 200, 'warm', 7, 38],
  ['HEAD', '/', 200, 'warm', 5, 52],
  ['GET', '/rss.xml', 200, 'cold', 96, 75],
  ['GET', '404 · unknown path', 404, 'cold', 41, 130],
  ['GET', '/writing', 200, 'warm', 11, 190],
  ['GET', '/api/stack', 200, 'cold', 132, 260],
  ['GET', '/resume.pdf', 200, 'warm', 15, 400],
] as const;
for (const [m, p, s, c, ms, ago] of feed) await putEntry(FeedEntrySchema.parse({ m, p, s, c, ms, t: at - ago * 1000 }));
console.log('seeded');
