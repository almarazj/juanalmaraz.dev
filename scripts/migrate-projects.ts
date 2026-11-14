// One-off: moves projects from `group` and problem/decision/result to context, live, domains and bodyMd.
// Idempotent, and a dry run unless `--write` is passed; the env vars pick the environment, as in migrate-images.
import { pathToFileURL } from 'node:url';
import { PROJECT_DOMAINS, ProjectSchema } from '../src/lib/content/schemas';

type Domain = (typeof PROJECT_DOMAINS)[number];

// Old stacks carried domains next to technologies; these move out of the stack.
const DOMAIN_TAGS: Record<string, Domain> = { DSP: 'DSP', Acoustics: 'Acoustics', Electronics: 'Electronics', ML: 'ML' };
const IMPLIES: Record<string, Domain> = { Arduino: 'Electronics' };

/** Null when the document already has the new shape; `guessed` names the fields picked by heuristic. */
export function migrateProject(old: Record<string, unknown>) {
  if (!('group' in old)) return null;
  const { group, problem, decision, result, ...rest } = old;
  const stack = (rest.stack as string[] | undefined) ?? [];
  const domains = new Set<Domain>(group === 'backend' ? ['Backend'] : []);
  for (const s of stack) {
    const d = DOMAIN_TAGS[s] ?? IMPLIES[s];
    if (d) domains.add(d);
  }
  const guessed = ['context'];
  if (domains.size === 0) {
    domains.add('DSP');
    guessed.push('domains');
  }
  const sections = ([['Problem', problem], ['Decision', decision], ['Result', result]] as const)
    .filter(([, text]) => typeof text === 'string' && text.trim())
    .map(([title, text]) => `## ${title}\n\n${(text as string).trim()}`);
  const bodyMd = [rest.bodyMd, ...sections].filter(Boolean).join('\n\n') || undefined;
  const doc = {
    ...rest,
    context: rest.confidential ? 'Client' : group === 'engineering' ? 'Academic' : 'Personal',
    live: false,
    domains: PROJECT_DOMAINS.filter((d) => domains.has(d)),
    stack: stack.filter((s) => !DOMAIN_TAGS[s]),
    ...(bodyMd && { bodyMd }),
  };
  return { doc: ProjectSchema.parse(doc), guessed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const write = process.argv.includes('--write');
  const { config } = await import('../src/lib/aws');
  const { listAll, saveWithRevision } = await import('../src/lib/content/repo');
  console.log(`${write ? 'Writing' : 'Dry run'} against ${config().table}`);
  for (const { id, data } of await listAll('projects')) {
    const out = migrateProject(data);
    if (!out) {
      console.log(`${id}: already migrated`);
      continue;
    }
    const { context, domains, stack } = out.doc;
    console.log(`${id}: ${context} · ${domains.join(', ')} · stack [${stack.join(', ')}]${out.doc.bodyMd ? ' · bodyMd' : ''} (guessed: ${out.guessed.join(', ')})`);
    if (write) await saveWithRevision('projects', id, out.doc, 'migrate-projects');
  }
}
