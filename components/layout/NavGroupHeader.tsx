import React from 'react';
import { ICONS } from '../../constants';
import NavSectionLabel from './NavSectionLabel';

type NavGroupHeaderProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
};

/** Collapsible group header in the main sidebar — label styling, chevron-only hover. */
export default function NavGroupHeader({ title, expanded, onToggle }: NavGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="w-full flex items-center justify-between px-3 py-1 group/header"
    >
      <NavSectionLabel as="span" variant="header" tone="sidebar">
        {title}
      </NavSectionLabel>
      <span
        className="text-slate-600 group-hover/header:text-slate-500 transition-colors rounded p-0.5 shrink-0"
        aria-hidden
      >
        {expanded
          ? React.cloneElement(ICONS.chevronDown as React.ReactElement, { width: 14, height: 14 })
          : React.cloneElement(ICONS.chevronRight as React.ReactElement, { width: 14, height: 14 })}
      </span>
    </button>
  );
}
