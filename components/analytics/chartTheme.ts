/** Shared chart colors — CSS variables with fallbacks for Recharts. */

export const CHART_COLORS = {
  income: 'var(--color-success, #10b981)',
  expense: 'var(--color-danger, #f43f5e)',
  profit: 'var(--color-primary, #6366f1)',
  neutral: 'var(--text-muted, #94a3b8)',
  inflow: 'var(--color-success, #10b981)',
  outflow: 'var(--color-danger, #f43f5e)',
  net: 'var(--color-primary, #6366f1)',
  donut: ['#10b981', '#6366f1', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'],
  aging: ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'],
};

export function useChartTheme() {
  if (typeof document === 'undefined') {
    return { isDark: false, grid: '#e2e8f0', tick: '#64748b', tooltipBg: '#ffffff', tooltipBorder: '#e2e8f0', tooltipText: '#1e293b' };
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    isDark,
    grid: isDark ? '#334155' : '#e2e8f0',
    tick: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? 'var(--modal-bg, #0f172a)' : 'var(--modal-bg, #ffffff)',
    tooltipBorder: isDark ? 'var(--border-color, #334155)' : 'var(--border-color, #e2e8f0)',
    tooltipText: isDark ? 'var(--text-primary, #f1f5f9)' : 'var(--text-primary, #1e293b)',
  };
}
