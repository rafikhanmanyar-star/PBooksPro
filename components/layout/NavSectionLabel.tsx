import React from 'react';

type NavSectionLabelProps = {
  children: React.ReactNode;
  /** header = sub-nav module title; section = grouped items within nav; form = mobile select label */
  variant?: 'header' | 'section' | 'form';
  /** sidebar = main dark sidebar group headers */
  tone?: 'default' | 'sidebar';
  as?: 'p' | 'span' | 'h3' | 'label';
  className?: string;
  htmlFor?: string;
};

const variantClass: Record<NonNullable<NavSectionLabelProps['variant']>, string> = {
  header: '',
  section: 'px-3 pb-1',
  form: 'mb-1',
};

export default function NavSectionLabel({
  children,
  variant = 'section',
  tone = 'default',
  as,
  className = '',
  htmlFor,
}: NavSectionLabelProps) {
  const Tag = as ?? (variant === 'form' ? 'label' : 'p');
  const toneClass = tone === 'sidebar' ? 'nav-section-label--sidebar' : '';

  return (
    <Tag
      className={`nav-section-label ${toneClass} ${variantClass[variant]} ${className}`.trim()}
      {...(htmlFor ? { htmlFor } : {})}
    >
      {children}
    </Tag>
  );
}
