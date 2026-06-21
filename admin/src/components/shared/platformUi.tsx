import React from 'react';

/**
 * Lightweight inline-styled primitives for the relocated platform-admin dashboards.
 * The admin portal does not use Tailwind, so these mirror the look of the existing
 * admin screens (cards, tables, badges) with plain inline styles.
 */

export const colors = {
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  card: '#ffffff',
  primary: '#2563eb',
  surface: '#f9fafb',
  danger: '#b91c1c',
  warn: '#b45309',
  ok: '#047857',
};

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.text }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: '0.875rem', color: colors.muted, marginTop: '0.25rem' }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        border: isPrimary ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: isPrimary ? colors.primary : colors.card,
        color: isPrimary ? '#fff' : colors.text,
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '0.75rem',
        padding: '1.25rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card style={{ padding: '1rem' }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: colors.muted, letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.text, marginTop: '0.25rem' }}>{value}</p>
      {sub && <p style={{ fontSize: '0.75rem', color: colors.muted, marginTop: '0.25rem' }}>{sub}</p>}
    </Card>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '0.75rem',
      }}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let bg = '#f1f5f9';
  let fg = '#334155';
  if (s === 'healthy' || s === 'active' || s === 'ok') {
    bg = '#d1fae5';
    fg = colors.ok;
  } else if (s === 'degraded' || s === 'trialing' || s === 'past_due' || s === 'warn') {
    bg = '#fef3c7';
    fg = colors.warn;
  } else if (s === 'unhealthy' || s === 'canceled' || s === 'expired' || s === 'failed' || s === 'error') {
    bg = '#fee2e2';
    fg = colors.danger;
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '0.125rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        backgroundColor: bg,
        color: fg,
      }}
    >
      {status}
    </span>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: '0.5rem',
        marginBottom: '1.25rem',
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: active === t.id ? colors.primary : 'transparent',
            color: active === t.id ? '#fff' : colors.muted,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        border: '1px solid #fecaca',
        backgroundColor: '#fef2f2',
        color: colors.danger,
        borderRadius: '0.75rem',
        padding: '0.75rem 1rem',
        fontSize: '0.875rem',
        marginBottom: '1rem',
      }}
    >
      {message}
    </div>
  );
}

export const tableStyles = {
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.875rem' },
  th: {
    textAlign: 'left' as const,
    padding: '0.5rem 0.75rem',
    fontSize: '0.7rem',
    textTransform: 'uppercase' as const,
    color: colors.muted,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
  },
  td: { padding: '0.5rem 0.75rem', borderBottom: `1px solid ${colors.border}`, color: colors.text },
};
