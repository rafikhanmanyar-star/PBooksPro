/**
 * Ensure packaged / local API servers always connect with an explicit PostgreSQL role.
 * Without a user in the URL, node-pg falls back to the OS username (e.g. Windows "PC").
 */
export function normalizeDatabaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Already has user@ before host
  if (/^postgres(ql)?:\/\/[^@/]+@/i.test(trimmed)) return trimmed;

  if (/^postgres(ql)?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^postgres(ql)?:\/\//i, (scheme) => `${scheme}postgres:@`);
  }

  return trimmed;
}
