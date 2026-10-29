/** Fills `{name}` placeholders: interpolate('{h} soat', { h: 2 }) → "2 soat". */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** The placeholder names in a template, for checking that translations keep them. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}
