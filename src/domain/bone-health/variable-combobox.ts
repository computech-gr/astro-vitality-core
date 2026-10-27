export interface ComboboxVariable {
  id: string;
  name: string;
}

/** Filters catalog entries by case-insensitive name or catalog ID substring. */
export function filterCatalogVariables<T extends ComboboxVariable>(
  variables: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...variables];
  return variables.filter(
    (v) => v.id.toLowerCase().includes(q) || v.name.toLowerCase().includes(q),
  );
}

/** Only an exact catalog ID may be committed as a selection. */
export function resolveCatalogSelection<T extends ComboboxVariable>(
  variables: readonly T[],
  candidateId: string | undefined,
): T | null {
  if (!candidateId) return null;
  return variables.find((v) => v.id === candidateId) ?? null;
}

/** Wrapping keyboard navigation index; -1 when the list is empty. */
export function moveActiveIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

export function variableLabel(v: ComboboxVariable): string {
  return `${v.name} (${v.id})`;
}
