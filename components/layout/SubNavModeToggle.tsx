import React from 'react';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  /** Narrow rail: icon-only */
  compact?: boolean;
};

/** Manual toggle: collapse secondary sidebar to a narrow rail, or expand to full width. */
const SubNavModeToggle: React.FC<Props> = ({ collapsed, onToggle, title, compact }) => (
  <button
    type="button"
    onClick={onToggle}
    title={title}
    aria-label={title}
    className={
      compact
        ? 'p-1.5 rounded-md text-app-muted hover:bg-app-toolbar hover:text-app-text border border-transparent'
        : 'p-1.5 rounded-md text-slate-500 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 shrink-0'
    }
  >
    {collapsed ? (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="15 18 9 12 15 6" />
      </svg>
    )}
  </button>
);

export default SubNavModeToggle;
