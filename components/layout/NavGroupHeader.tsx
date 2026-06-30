import React from 'react';
import { ICONS } from '../../constants';
import NavSectionLabel from './NavSectionLabel';

type NavGroupHeaderProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
};

/** Collapsible group header in the main sidebar. */
export default function NavGroupHeader({ title, expanded, onToggle }: NavGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="sidebar-group-header group/header"
    >
      <NavSectionLabel as="span" variant="header" tone="sidebar">
        {title}
      </NavSectionLabel>
      <span className="sidebar-group-chevron" aria-hidden>
        {expanded
          ? React.cloneElement(ICONS.chevronDown as React.ReactElement<{ width?: number; height?: number }>, { width: 14, height: 14 })
          : React.cloneElement(ICONS.chevronRight as React.ReactElement<{ width?: number; height?: number }>, { width: 14, height: 14 })}
      </span>
    </button>
  );
}
