import { z } from 'zod';
import {
  AboutSchema, CertificateSchema, EducationSchema, ExperienceSchema, PostSchema, ProjectSchema, SiteSchema,
} from './schemas';

// Fields the server owns: post timestamps are stamped on save, the resume path by the resume upload.
export const editableSchemas = {
  posts: PostSchema.omit({ publishedAt: true, updatedAt: true }),
  projects: ProjectSchema,
  experience: ExperienceSchema,
  education: EducationSchema,
  certificates: CertificateSchema,
  about: AboutSchema,
  site: SiteSchema.omit({ resumePath: true }),
};
export type EditableCollection = keyof typeof editableSchemas;
export const SINGLETONS: readonly EditableCollection[] = ['about', 'site'];
export const isEditable = (c: string): c is EditableCollection => Object.hasOwn(editableSchemas, c);
export const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

export type Field =
  | { name: string; kind: 'text' | 'textarea' | 'markdown' | 'number' | 'checkbox' | 'list' | 'json'; optional: boolean; nullable: boolean }
  | { name: string; kind: 'select'; options: string[]; optional: boolean; nullable: boolean };

const MARKDOWN = new Set(['bodyMd', 'bio']);
const TEXTAREA = new Set(['summary', 'problem', 'decision', 'result']);

export function fieldsOf(collection: EditableCollection): Field[] {
  return Object.entries(editableSchemas[collection].shape).map(([name, raw]) => {
    let type = raw as z.ZodType;
    let optional = false;
    let nullable = false;
    for (;;) {
      if (type instanceof z.ZodOptional) optional = true;
      else if (type instanceof z.ZodNullable) nullable = true;
      else break;
      type = type.unwrap() as z.ZodType;
    }
    const base = { name, optional, nullable };
    if (type instanceof z.ZodEnum) return { ...base, kind: 'select', options: type.options.map(String) };
    if (type instanceof z.ZodNumber) return { ...base, kind: 'number' };
    if (type instanceof z.ZodBoolean) return { ...base, kind: 'checkbox' };
    if (type instanceof z.ZodArray && type.element instanceof z.ZodString) return { ...base, kind: 'list' };
    if (type instanceof z.ZodString) {
      return { ...base, kind: MARKDOWN.has(name) ? 'markdown' : TEXTAREA.has(name) ? 'textarea' : 'text' };
    }
    return { ...base, kind: 'json' };
  });
}

/** Form value as the editor shows it: lists comma-separated, JSON pretty-printed, absent as empty. */
export function toFormValue(field: Field, value: unknown): string | boolean {
  if (field.kind === 'checkbox') return Boolean(value);
  if (value === undefined || value === null) return '';
  if (field.kind === 'list') return (value as string[]).join(', ');
  if (field.kind === 'json') return JSON.stringify(value, null, 2);
  return String(value);
}

export type FieldErrors = Record<string, string>;

/** Inverse of toFormValue; a field that cannot be read (bad JSON, not a number) becomes an error. */
export function fromForm(fields: Field[], values: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (f.kind === 'checkbox') {
      data[f.name] = raw === true;
      continue;
    }
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '' && f.kind !== 'list' && (f.optional || f.nullable)) {
      data[f.name] = f.nullable ? null : undefined;
      continue;
    }
    if (f.kind === 'number') {
      data[f.name] = text === '' ? Number.NaN : Number(text);
      if (Number.isNaN(data[f.name])) errors[f.name] = text === '' ? 'Required' : 'Enter a number';
    } else if (f.kind === 'list') {
      data[f.name] = text.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (f.kind === 'json') {
      try {
        data[f.name] = JSON.parse(text);
      } catch {
        errors[f.name] = 'Invalid JSON';
      }
    } else {
      // Markdown and prose keep their inner whitespace; only the edges are trimmed.
      data[f.name] = f.kind === 'markdown' ? String(raw) : text;
    }
  }
  return { data, errors };
}

export function validate(collection: EditableCollection, data: unknown) {
  const result = editableSchemas[collection].safeParse(data);
  if (result.success) return { ok: true as const, data: result.data as Record<string, unknown> };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    const where = issue.path.length > 1 ? `${issue.path.slice(1).join('.')}: ` : '';
    errors[key] ??= where + issue.message;
  }
  return { ok: false as const, errors };
}
