/** Shared alert / info surfaces for Backup Center pages (light + dark). */

export const backupAlertSuccess =
  'rounded-lg border border-ds-success/30 bg-[color:var(--badge-paid-bg)] text-app-text';
export const backupAlertWarning =
  'rounded-lg border border-ds-warning/30 bg-[color:var(--badge-partial-bg)] text-app-text';
export const backupAlertError =
  'rounded-lg border border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-app-text';
export const backupAlertInfo =
  'rounded-lg border border-primary/20 bg-primary/10 text-app-text text-xs';

export function backupMessageAlertClass(type: 'success' | 'warning' | 'error'): string {
  switch (type) {
    case 'success':
      return `${backupAlertSuccess} p-3 flex items-start gap-2`;
    case 'warning':
      return `${backupAlertWarning} p-3 flex items-start gap-2`;
    default:
      return `${backupAlertError} p-3 flex items-start gap-2`;
  }
}
