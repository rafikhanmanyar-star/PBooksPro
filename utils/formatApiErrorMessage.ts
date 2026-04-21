/** Human-readable message for thrown API errors (plain objects) and standard Errors. */
export function formatApiErrorMessage(error: unknown): string {
  if (error == null) return 'Unknown error';
  if (error instanceof Error) return error.message || 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const nested = o.error;
    if (nested && typeof nested === 'object' && nested !== null) {
      const nm = (nested as Record<string, unknown>).message;
      if (typeof nm === 'string' && nm.trim()) return nm.trim();
    }
    const msg = o.message ?? o.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }
  return String(error);
}
