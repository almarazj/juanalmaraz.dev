import type { PaletteItem } from '../../components/site/palette';
import { getSingleton, listPublished } from './repo';

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function buildSearchIndex(): Promise<PaletteItem[]> {
  const [experience, projects, education, posts, about] = await Promise.all([
    listPublished('experience'),
    listPublished('projects'),
    listPublished('education'),
    listPublished('posts'),
    getSingleton('about/main'),
  ]);
  const section = (label: string, id: string, key: string, hint: string): PaletteItem => ({
    group: 'Sections', label, hint, target: `/#${id}`, keys: ['g', key],
  });
  return [
    section('Experience', 'experience', 'e', 'Roles and tenure'),
    section('Projects', 'projects', 'p', 'Backend work and earlier engineering'),
    section('Education', 'education', 'd', 'Degree and certificates'),
    section('Writing', 'writing', 'w', 'Posts'),
    section('About', 'about', 'a', 'Photos, bio and quick questions'),
    ...experience.map((x) => ({
      group: 'Experience', label: x.role, hint: `${x.org} · ${x.place}`, target: `/#exp-${x.id}`,
    })),
    ...projects.map((p) => ({
      group: 'Projects', label: p.title, hint: short(p.summary), target: `/#proj-${p.group}`,
      color: p.group === 'engineering' ? 'engineering' : 'projects',
    })),
    ...posts.map((p) => ({
      group: 'Writing', label: p.title, hint: short(p.summary), target: `/writing/${p.id}`,
    })),
    ...education.map((e) => ({
      group: 'Education', label: e.title, hint: e.school, target: '/#edu-degree',
    })),
    {
      group: 'About', label: 'Quick questions',
      hint: about.questions.map((q) => `${q.q} ${q.a}`).join(' · '), target: '/#about-questions',
    },
    { group: 'Links', label: 'Resume', hint: 'PDF', target: '/resume.pdf', keys: ['r'] },
    { group: 'Links', label: 'GitHub', hint: 'github.com/almarazj', target: 'https://github.com/almarazj' },
    { group: 'Links', label: 'LinkedIn', hint: 'linkedin.com/in/juan-almaraz', target: 'https://www.linkedin.com/in/juan-almaraz/' },
    { group: 'Links', label: 'RSS', hint: 'Subscribe to writing', target: '/rss.xml' },
    { group: 'Actions', label: 'Switch theme', hint: 'Light or dark', target: 'action:theme', keys: ['t'] },
    { group: 'Actions', label: 'Back to top', hint: 'Scroll to the hero', target: 'action:top', keys: ['g', 'g'] },
  ];
}
