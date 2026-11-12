import type { Doc } from './repo';
import type { Site } from './schemas';

export const me = (site: Site) => ({
  name: 'Juan Almaraz',
  role: site.roleLine.split(' · ')[0],
  based: 'Buenos Aires, AR',
  links: {
    resume: 'https://juanalmaraz.dev/resume.pdf',
    linkedin: 'https://linkedin.com/in/juan-almaraz',
    github: 'https://github.com/almarazj',
  },
});

export const experience = (roles: Doc<'experience'>[]) =>
  roles.map(({ role, org, place, start, end, summary, stack }) => ({ role, org, place, start, end, summary, stack }));

// shortcut: infra is a fixed name list, move it to the experience schema if tagging by hand gets tedious.
const infraNames = new Set(['GCP', 'AWS', 'Cloud Run', 'Cloud Tasks', 'Pub/Sub', 'Firestore', 'Postgres', 'Redis', 'Terraform', 'Docker', 'Kubernetes']);

export function stack(roles: Doc<'experience'>[]) {
  const current = [...new Set(roles.filter((r) => r.end === null).flatMap((r) => r.stack))];
  return { daily: current.filter((s) => !infraNames.has(s)), infra: current.filter((s) => infraNames.has(s)) };
}
