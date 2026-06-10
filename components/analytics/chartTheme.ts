/** Shared chart colors — CSS variables; reactive to theme via useThemeColors. */

import { useMemo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { themeTokens } from '../../design-system/tokens';

export const CHART_COLORS = {
  income: themeTokens.success,
  expense: themeTokens.danger,
  profit: themeTokens.primary,
  neutral: themeTokens.textMuted,
  inflow: themeTokens.success,
  outflow: themeTokens.danger,
  net: themeTokens.primary,
  /** Intentional data-series palette (readable in both themes) */
  donut: ['#22c55e', '#6366f1', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899'],
  aging: ['#22c55e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'],
} as const;

export function useChartTheme() {
  const { isDark, vars } = useThemeColors();

  return useMemo(
    () => ({
      isDark,
      grid: isDark ? 'var(--border-color)' : 'var(--border-color)',
      tick: themeTokens.textMuted,
      tooltipBg: vars.modalBackground,
      tooltipBorder: vars.border,
      tooltipText: vars.textPrimary,
      axis: vars.textMuted,
      background: 'transparent',
    }),
    [isDark, vars]
  );
}
