export const CATEGORIES = ['Languages', 'Frameworks', 'Databases', 'Testing', 'Cloud & infra'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Low to high, the order the board's columns read in. */
export const LEVELS = [
  { id: 'tinkering', label: 'Tinkering' },
  { id: 'side', label: 'Side projects' },
  { id: 'production', label: 'Production' },
] as const;
export type Level = (typeof LEVELS)[number]['id'];

/**
 * Only names listed here reach the board, so non-software stack entries (DSP, Electronics) stay off it.
 * `icon` names a Devicon (MIT) file in public/tech/; `dark` means a light-on-dark copy sits next to it as <icon>-dark.svg.
 */
export const CATALOG: Record<string, { category: Category; icon?: string; dark?: boolean }> = {
  Python: { category: 'Languages', icon: 'python' },
  TypeScript: { category: 'Languages', icon: 'typescript' },
  JavaScript: { category: 'Languages', icon: 'javascript' },
  'Node.js': { category: 'Languages', icon: 'nodejs' },
  Go: { category: 'Languages', icon: 'go' },
  Rust: { category: 'Languages', icon: 'rust', dark: true },
  Bash: { category: 'Languages', icon: 'bash' },
  FastAPI: { category: 'Frameworks', icon: 'fastapi' },
  Django: { category: 'Frameworks', icon: 'django', dark: true },
  SQLAlchemy: { category: 'Frameworks', icon: 'sqlalchemy' },
  Astro: { category: 'Frameworks', icon: 'astro', dark: true },
  PostgreSQL: { category: 'Databases', icon: 'postgresql' },
  MySQL: { category: 'Databases', icon: 'mysql', dark: true },
  DynamoDB: { category: 'Databases', icon: 'dynamodb' },
  Redis: { category: 'Databases', icon: 'redis' },
  pytest: { category: 'Testing', icon: 'pytest' },
  Playwright: { category: 'Testing', icon: 'playwright' },
  Vitest: { category: 'Testing', icon: 'vitest' },
  AWS: { category: 'Cloud & infra', icon: 'aws', dark: true },
  GCP: { category: 'Cloud & infra', icon: 'gcp' },
  Docker: { category: 'Cloud & infra', icon: 'docker' },
  Kubernetes: { category: 'Cloud & infra', icon: 'kubernetes' },
  Terraform: { category: 'Cloud & infra', icon: 'terraform' },
  'GitHub Actions': { category: 'Cloud & infra', icon: 'githubactions' },
  Lambda: { category: 'Cloud & infra' },
  SQS: { category: 'Cloud & infra' },
  SNS: { category: 'Cloud & infra' },
  S3: { category: 'Cloud & infra' },
  CloudFront: { category: 'Cloud & infra' },
};

const ALIASES: Record<string, string> = { Postgres: 'PostgreSQL', Node: 'Node.js', K8s: 'Kubernetes' };

export const laneId = (c: Category) => `tech-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`;

export interface Tech {
  name: string;
  icon?: string;
  dark?: boolean;
}

export interface Board {
  counts: Record<Level, number>;
  lanes: { category: Category; cells: Record<Level, Tech[]> }[];
}

/** Places each cataloged name at the highest level it shows up in; lanes with nothing in them are left out. */
export function technologyBoard(sources: Record<Level, string[]>): Board {
  const level = new Map<string, Level>();
  for (const { id } of LEVELS) {
    for (const raw of sources[id]) {
      const name = ALIASES[raw.trim()] ?? raw.trim();
      if (CATALOG[name]) level.set(name, id);
    }
  }
  const counts = { tinkering: 0, side: 0, production: 0 };
  for (const l of level.values()) counts[l]++;
  const lanes = CATEGORIES.map((category) => {
    const cells: Record<Level, Tech[]> = { tinkering: [], side: [], production: [] };
    for (const [name, l] of level) {
      const { category: c, icon, dark } = CATALOG[name];
      if (c === category) cells[l].push({ name, icon, dark });
    }
    return { category, cells };
  }).filter((lane) => LEVELS.some(({ id }) => lane.cells[id].length > 0));
  return { counts, lanes };
}
