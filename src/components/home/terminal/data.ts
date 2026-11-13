import { me, stack } from '../../../lib/content/public-api';
import type { Doc } from '../../../lib/content/repo';
import type { About, Site } from '../../../lib/content/schemas';
import type { Build } from './commands';
import type { DirNode, FileNode } from './fs';
import type { NeofetchInfo } from './neofetch';

export interface TerminalContent {
  site: Site;
  about: About;
  experience: Doc<'experience'>[];
  projects: Doc<'projects'>[];
  education: Doc<'education'>[];
  certificates: Doc<'certificates'>[];
  posts: Doc<'posts'>[];
}

/** Everything the shell needs, serialized into the page once. */
export interface TerminalData {
  info: NeofetchInfo;
  build: Build;
  home: DirNode;
}

const md = (body: string, href?: string): FileNode => ({ t: 'f', kind: 'md', body, href });
const dir = (entries: [string, FileNode][], href: string): DirNode => ({ t: 'd', c: Object.fromEntries(entries), href });
const postDate = (t: number) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(t);
const section = (title: string, body?: string) => (body ? `\n\n## ${title}\n${body}` : '');

export function terminalData(c: TerminalContent, build: Build): TerminalData {
  const profile = me(c.site);
  const tech = stack(c.experience);
  const degree = c.education[0];
  const info: NeofetchInfo = {
    role: profile.role,
    based: profile.based,
    stack: [...tech.daily, ...tech.infra],
    // The title only: with the school's full name the line pushes neofetch's info below the art.
    education: degree?.title,
    languages: c.site.languages,
    careerStart: c.site.careerStart,
    links: { resume: '/resume.pdf', github: profile.links.github, linkedin: profile.links.linkedin },
    projects: c.projects.length,
    posts: c.posts.length,
  };

  const experience = c.experience.map((x): [string, FileNode] => [
    `${x.id}.md`,
    md(`# ${x.role}\n${x.org} · ${x.place} · ${x.start} to ${x.end ?? 'now'}\n\n${x.summary}${x.stack.length ? `\n\n- ${x.stack.join(', ')}` : ''}`, `/#exp-${x.id}`),
  ]);
  const projects = c.projects.map((p): [string, FileNode] => [
    `${p.id}.md`,
    md(
      `# ${p.title}\n${[p.year, p.group, ...p.stack, ...(p.confidential ? ['confidential'] : [])].join(' · ')}\n\n${p.summary}`
        + section('Problem', p.problem) + section('Decision', p.decision) + section('Result', p.result)
        + (p.links.length ? `\n\n${p.links.map((l) => `- ${l.label}: ${l.url}`).join('\n')}` : ''),
      p.links[0]?.url ?? `/#proj-${p.group}`,
    ),
  ]);
  const posts = c.posts.map((p): [string, FileNode] => [
    `${p.id}.md`,
    md(`# ${p.title}\n${[postDate(p.publishedAt), ...p.tags].join(' · ')}\n\n${p.summary}\n\nRead it: open ${p.id}.md`, `/writing/${p.id}`),
  ]);
  const degrees = c.education.map((e): [string, FileNode] => [
    `${e.id}.md`,
    md(`# ${e.title}\n${e.school} · ${e.start} to ${e.end ?? 'now'}\n\n${e.summary}${e.thesis ? `\n\nThesis: ${e.thesis}` : ''}`, '/#edu-degree'),
  ]);
  const certificates: FileNode = {
    t: 'f',
    kind: 'txt',
    href: '/#edu-certs',
    body: c.certificates.map((x) => [x.name.padEnd(34), x.issuer.padEnd(14), x.year, x.level ?? ''].join('  ').trimEnd()).join('\n'),
  };

  const home: DirNode = {
    t: 'd',
    c: {
      '.bashrc': { t: 'f', kind: 'txt', body: "# ~/.bashrc\nexport EDITOR=vim\nalias ll='ls -la'\nalias la='ls -a'\nalias l='ls'\n\nneofetch" },
      'about.md': md(`# About\n${[profile.name, profile.role, profile.based].join(' · ')}\n\n${c.site.lede}\n\n${c.about.bio}`, '/#about'),
      'now.json': { t: 'f', kind: 'json', json: c.site.now },
      'stack.json': { t: 'f', kind: 'json', json: tech },
      'resume.pdf': { t: 'f', kind: 'pdf', href: '/resume.pdf' },
      'access.log': { t: 'f', kind: 'log' },
      experience: dir(experience, '/#experience'),
      projects: dir(projects, '/#projects'),
      writing: dir(posts, '/#writing'),
      education: dir([...degrees, ['certificates.txt', certificates]], '/#education'),
    },
  };
  return { info, build, home };
}
