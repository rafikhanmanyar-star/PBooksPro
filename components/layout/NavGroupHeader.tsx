import React from 'react';
import { ChevronDown } from 'lucide-react';

type NavGroupHeaderProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
};

/** Collapsible group header in the main sidebar — high-contrast section label + animated chevron. */
export default function NavGroupHeader({ title, expanded, onToggle }: NavGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="sidebar-group-header group/header"
    >
      <span className="sidebar-group-header__label">{title}</span>
      <span
        className={`sidebar-group-header__chevron ${
          expanded ? 'sidebar-group-header__chevron--expanded' : 'sidebar-group-header__chevron--collapsed'
        }`}
        aria-hidden
      >
        <ChevronDown size={14} strokeWidth={2.5} />
      </span>
    </button>
  );
}
