import { tenure } from '../tenure';
import { esc, link, span } from './html';

export const USER = 'juan';
export const HOST = 'ubuntu';

export interface NeofetchInfo {
  role: string;
  based: string;
  stack: string[];
  education?: string;
  languages?: string;
  /** YYYY-MM of the first software role. */
  careerStart?: string;
  links: { resume: string; github: string; linkedin: string };
  projects: number;
  posts: number;
}

// shortcut: the clock assumes `based` is Buenos Aires; derive the zone from the place if that ever changes.
const ZONE = 'America/Argentina/Buenos_Aires';
const ZONE_LABEL = 'GMT-3';
export const localTime = (now: Date) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ZONE }).format(now);

export function uptime(careerStart: string, now: Date): string {
  const years = Math.floor(tenure(careerStart, null, now).years);
  return years < 1 ? 'under a year in software engineering' : `${years}+ years in software engineering`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Row = { key: string; text: string; html?: string };

/** `clock` is the visitor-side local time; the server leaves it out so cached pages never show a stale one. */
export function rows(info: NeofetchInfo, now: Date, clock?: string): Row[] {
  const out: Row[] = [{ key: 'Role', text: info.role }];
  if (info.careerStart) out.push({ key: 'Uptime', text: uptime(info.careerStart, now) });
  out.push({ key: 'Stack', text: info.stack.join(', ') });
  out.push({ key: 'Based', text: clock ? `${info.based} · ${clock} (${ZONE_LABEL})` : info.based });
  if (info.education) out.push({ key: 'Education', text: info.education });
  if (info.languages) out.push({ key: 'Languages', text: info.languages });
  const { resume, github, linkedin } = info.links;
  out.push({
    key: 'Links',
    text: 'resume · github · linkedin',
    html: `${link(resume, 'resume')} · ${link(github, 'github')} · ${link(linkedin, 'linkedin')}`,
  });
  out.push({ key: 'Packages', text: `${plural(info.projects, 'project')}, ${plural(info.posts, 'post')}` });
  return out;
}

const SWATCHES = ['dim', 'err', 'ok', 'acc', 'info', 'mag', 'cyan', 'fg'];

export function neofetchHTML(info: NeofetchInfo, now: Date, art: string, clock?: string): string {
  const head = `${span('c-acc b', USER)}@${span('c-acc b', HOST)}\n${'-'.repeat(USER.length + HOST.length + 1)}`;
  const body = rows(info, now, clock).map((r) => `${span('c-acc b', r.key)}: ${r.html ?? esc(r.text)}`).join('\n');
  const swatches = SWATCHES.map((c) => `<span class="sw sw-${c}"></span>`).join('');
  return `<div class="nf"><div class="nf-art" data-spin aria-hidden="true">${esc(art)}</div><div class="nf-info">${head}\n${body}\n\n${swatches}\n\n${span('c-dim', 'type help to look around')}</div></div>`;
}

export const neofetchText = (info: NeofetchInfo, now: Date, clock?: string) =>
  `${USER}@${HOST}\n${rows(info, now, clock).map((r) => `${r.key}: ${r.text}`).join('\n')}`;
