/**
 * Design system token names (reference for TS and docs).
 * Authoritative values live in styles/design-tokens.css as CSS variables.
 */

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
