/**
 * Design system token names (reference for TS and docs).
 * Authoritative values live in styles/design-tokens.css as CSS variables.
 */

/** Semantic theme tokens — use in components, charts, and inline styles */
export const themeTokens = {
  background: 'var(--bg-primary)',
  backgroundSecondary: 'var(--surface-secondary)',
  cardBackground: 'var(--card-bg)',
  modalBackground: 'var(--modal-bg)',
  popoverBackground: 'var(--popover-bg)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textInverse: 'var(--text-inverse)',
  border: 'var(--border-color)',
  borderHover: 'var(--border-hover)',
  borderFocus: 'var(--border-focus)',
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  tableHeader: 'var(--table-header-bg)',
  tableRow: 'var(--table-row-bg)',
  tableRowHover: 'var(--table-row-hover)',
  tableBorder: 'var(--table-border)',
  inputBackground: 'var(--input-bg)',
  inputBorder: 'var(--input-border)',
  inputText: 'var(--input-text)',
  inputPlaceholder: 'var(--text-placeholder)',
} as const;

export const cssVar = {
  color: {
    primary: 'var(--color-primary)',
    primaryHover: 'var(--color-primary-hover)',
    primaryActive: 'var(--color-primary-active)',
    onPrimary: 'var(--color-on-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
  },
  surface: {
    primary: 'var(--surface-primary)',
    secondary: 'var(--surface-secondary)',
  },
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
    placeholder: 'var(--text-placeholder)',
  },
  border: {
    default: 'var(--border-color)',
    subtle: 'var(--border-subtle)',
    input: 'var(--input-border)',
  },
  space: {
    xs: 'var(--space-xs)',
    sm: 'var(--space-sm)',
    md: 'var(--space-md)',
    lg: 'var(--space-lg)',
    xl: 'var(--space-xl)',
    xxl: 'var(--space-xxl)',
  },
  radius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
  },
  shadow: {
    card: 'var(--shadow-card)',
    modal: 'var(--shadow-modal)',
  },
  layout: {
    sidebarWidth: 'var(--sidebar-width)',
  },
} as const;

export type CssVarKeys = keyof typeof cssVar;
