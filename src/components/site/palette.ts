export interface PaletteItem {
  group: string;
  label: string;
  hint: string;
  // "/#id" and "/writing/slug" navigate, "https://..." opens, "action:theme" and "action:top" run.
  target: string;
  keys?: string[];
  // Section color token name (c-<color>); defaults to the group's.
  color?: string;
}

export const GROUPS = ['Sections', 'Experience', 'Projects', 'Writing', 'Education', 'About', 'Links', 'Actions'];

export function search(index: PaletteItem[], q: string): PaletteItem[] {
  const needle = q.trim().toLowerCase();
  const rank = (g: string) => GROUPS.indexOf(g);
  return index
    .filter((i) => !needle || `${i.label}\n${i.hint}\n${i.group}`.toLowerCase().includes(needle))
    .sort((a, b) => rank(a.group) - rank(b.group)); // stable: keeps index order inside a group
}

export function dotColor(i: PaletteItem): string {
  const name = i.color ?? (i.group === 'Sections' ? i.label.toLowerCase() : i.group.toLowerCase());
  return ['experience', 'projects', 'engineering', 'education', 'writing', 'about'].includes(name)
    ? `var(--c-${name})`
    : 'var(--faint)';
}
