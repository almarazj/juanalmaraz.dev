import { describe, expect, it } from 'vitest';
import { AboutSchema, CertificateSchema, ExperienceSchema, PostSchema, ProjectSchema } from '../../src/lib/content/schemas';

const post = {
  title: 'T', summary: 's', bodyMd: 'b', tags: [], status: 'draft',
  publishedAt: 1, updatedAt: 1,
};
const exp = {
  role: 'r', org: 'o', monogram: 'O', start: '2024-04', end: null,
  place: 'p', summary: 's', stack: [], order: 1,
};

describe('schemas', () => {
  it('accepts a valid post', () => expect(PostSchema.safeParse(post).success).toBe(true));
  it('rejects a post without title', () => {
    const rest: Partial<typeof post> = { ...post };
    delete rest.title;
    expect(PostSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects a status outside the enum', () =>
    expect(PostSchema.safeParse({ ...post, status: 'archived' }).success).toBe(false));
  it('experience.end accepts null and YYYY-MM, rejects YYYY-M', () => {
    expect(ExperienceSchema.safeParse(exp).success).toBe(true);
    expect(ExperienceSchema.safeParse({ ...exp, end: '2024-04' }).success).toBe(true);
    expect(ExperienceSchema.safeParse({ ...exp, end: '2024-4' }).success).toBe(false);
  });

  describe('URL fields accept only http and https', () => {
    const project = {
      title: 'P', group: 'backend', year: 2025, summary: 's', stack: [], links: [] as { label: string; url: string }[],
      confidential: false, order: 1, status: 'published',
    };
    const cert = { name: 'C', issuer: 'I', year: 2025, order: 1 };
    const about = (link: string) => ({ bio: '', photos: [], questions: [{ q: 'q', a: 'a', detail: 'd', icon: 'book', link }] });
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      it(`rejects ${bad.slice(0, 11)}`, () => {
        expect(ProjectSchema.safeParse({ ...project, links: [{ label: 'x', url: bad }] }).success).toBe(false);
        expect(CertificateSchema.safeParse({ ...cert, verifyUrl: bad }).success).toBe(false);
        expect(AboutSchema.safeParse(about(bad)).success).toBe(false);
      });
    }
    it('accepts https', () => {
      expect(ProjectSchema.safeParse({ ...project, links: [{ label: 'x', url: 'https://github.com/a' }] }).success).toBe(true);
      expect(CertificateSchema.safeParse({ ...cert, verifyUrl: 'https://www.efset.org/' }).success).toBe(true);
      expect(AboutSchema.safeParse(about('https://letterboxd.com/film/x/')).success).toBe(true);
    });
  });
});
