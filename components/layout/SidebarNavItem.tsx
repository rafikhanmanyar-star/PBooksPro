import React from 'react';

type SidebarNavItemProps = {
  label: string;
  icon: React.ReactElement;
  active: boolean;
  primary?: boolean;
  collapsed?: boolean;
  onClick: () => void;
  tourAttr?: string;
};

/** Single nav link in the main sidebar — shared across mobile, expanded, and icon-rail modes. */
export default function SidebarNavItem({
  label,
  icon,
  active,
  primary = false,
  collapsed = false,
  onClick,
  tourAttr,
}: SidebarNavItemProps) {
  const iconSize = collapsed ? 20 : 18;

  const className = [
    'sidebar-nav-item',
    active ? 'sidebar-nav-item--active' : '',
    primary && !active ? 'sidebar-nav-item--primary' : '',
    collapsed ? 'sidebar-nav-item--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-tour={tourAttr}
      className={className}
    >
      <span className="sidebar-nav-icon" aria-hidden>
        {React.cloneElement(icon, { width: iconSize, height: iconSize } as { width: number; height: number })}
      </span>
      {!collapsed && <span className="sidebar-nav-label">{label}</span>}
    </button>
  );
}
