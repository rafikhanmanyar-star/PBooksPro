/** Set PBOOKS_PERF_PAYROLL=1 to log payroll API timings (process run, bulk pay, etc.). */

export function perfPayrollEnabled(): boolean {
  const v = process.env.PBOOKS_PERF_PAYROLL;
  return v === '1' || v === 'true' || v === 'yes';
}

export function perfPayrollLog(label: string, ms: number, extra?: Record<string, unknown>): void {
  if (!perfPayrollEnabled()) return;
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[PBOOKS_PERF_PAYROLL] ${label} ${ms.toFixed(1)}ms`, extra);
  } else {
    console.log(`[PBOOKS_PERF_PAYROLL] ${label} ${ms.toFixed(1)}ms`);
  }
}

export function perfPayrollNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
