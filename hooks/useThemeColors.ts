import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { themeTokens } from '../design-system/tokens';

/**
 * React hook returning semantic theme token CSS variables.
 * Subscribes to ThemeContext so charts and inline styles re-render on theme switch.
 */
export function useThemeColors() {
  const { theme } = useTheme();

  return useMemo(
    () => ({
      mode: theme,
      isDark: theme === 'dark',
      tokens: themeTokens,
      /** Inline style map for canvas/SVG when class names are impractical */
      vars: {
        background: themeTokens.background,
        backgroundSecondary: themeTokens.backgroundSecondary,
        cardBackground: themeTokens.cardBackground,
        modalBackground: themeTokens.modalBackground,
        popoverBackground: themeTokens.popoverBackground,
        textPrimary: themeTokens.textPrimary,
        textSecondary: themeTokens.textSecondary,
        textMuted: themeTokens.textMuted,
        textInverse: themeTokens.textInverse,
        border: themeTokens.border,
        borderHover: themeTokens.borderHover,
        borderFocus: themeTokens.borderFocus,
        primary: themeTokens.primary,
        primaryHover: themeTokens.primaryHover,
        success: themeTokens.success,
        warning: themeTokens.warning,
        danger: themeTokens.danger,
        tableHeader: themeTokens.tableHeader,
        tableRow: themeTokens.tableRow,
        tableRowHover: themeTokens.tableRowHover,
        tableBorder: themeTokens.tableBorder,
        inputBackground: themeTokens.inputBackground,
        inputBorder: themeTokens.inputBorder,
        inputText: themeTokens.inputText,
        inputPlaceholder: themeTokens.inputPlaceholder,
      },
    }),
    [theme]
  );
}
