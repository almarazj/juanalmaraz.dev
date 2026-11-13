import { z } from 'zod';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const status = z.enum(['draft', 'published']);
const epoch = z.number().int();

export const ImageRefSchema = z.object({
  base: z.string(),
  widths: z.array(z.number().int().positive()).min(1),
  alt: z.string(),
});

export const PostSchema = z.object({
  title: z.string().min(1, 'Required'),
  summary: z.string(),
  bodyMd: z.string(),
  tags: z.array(z.string()),
  status,
  publishedAt: epoch,
  updatedAt: epoch,
  series: z.object({ id: z.string(), title: z.string(), part: z.number().int().positive() }).optional(),
});

export const ProjectSchema = z.object({
  title: z.string().min(1, 'Required'),
  group: z.enum(['backend', 'engineering']),
  year: z.number().int(),
  summary: z.string(),
  problem: z.string().optional(),
  decision: z.string().optional(),
  result: z.string().optional(),
  stack: z.array(z.string()),
  links: z.array(z.object({ label: z.string(), url: z.httpUrl('Use an http(s) URL') })),
  image: ImageRefSchema.optional(),
  diagram: ImageRefSchema.optional(),
  confidential: z.boolean(),
  order: z.number(),
  status,
});

export const ExperienceSchema = z.object({
  role: z.string().min(1, 'Required'),
  org: z.string().min(1, 'Required'),
  monogram: z.string().min(1, 'Required'),
  start: month,
  end: month.nullable(),
  place: z.string(),
  summary: z.string(),
  stack: z.array(z.string()),
  order: z.number(),
});

export const EducationSchema = z.object({
  title: z.string().min(1, 'Required'),
  school: z.string().min(1, 'Required'),
  start: month,
  end: month.nullable(),
  summary: z.string(),
});

export const CertificateSchema = z.object({
  name: z.string().min(1, 'Required'),
  issuer: z.string().min(1, 'Required'),
  year: z.number().int(),
  level: z.string().optional(),
  file: ImageRefSchema.optional(),
  verifyUrl: z.httpUrl('Use an http(s) URL').optional(),
  order: z.number(),
});

export const AboutSchema = z.object({
  bio: z.string(),
  photos: z.array(z.object({ image: ImageRefSchema, caption: z.string() })),
  questions: z.array(
    z.object({ q: z.string(), a: z.string(), detail: z.string(), icon: z.string(), link: z.httpUrl('Use an http(s) URL').optional() }),
  ),
});

export const SiteSchema = z.object({
  lede: z.string(),
  roleLine: z.string(),
  resumePath: z.string(),
  photo: ImageRefSchema.optional(),
  now: z.record(z.string(), z.string()),
  languages: z.string().optional(),
  careerStart: month.optional(),
});

export const FeedEntrySchema = z.object({
  m: z.enum(['GET', 'POST', 'HEAD']),
  p: z.string(),
  s: z.number().int(),
  c: z.enum(['cold', 'warm']),
  ms: z.number().int().min(0),
  t: epoch,
});

export type Post = z.infer<typeof PostSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Certificate = z.infer<typeof CertificateSchema>;
export type About = z.infer<typeof AboutSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type FeedEntry = z.infer<typeof FeedEntrySchema>;
export type ImageRef = z.infer<typeof ImageRefSchema>;
