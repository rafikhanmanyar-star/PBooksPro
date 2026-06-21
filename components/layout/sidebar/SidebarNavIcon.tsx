import React from 'react';
import { SIDEBAR_PAGE_VISUALS } from './sidebarNavVisuals';

type SidebarNavIconProps = {
  page: string;
  active: boolean;
  fallbackIcon?: React.ReactElement;
  size?: number;
};

export default function SidebarNavIcon({
  page,
  active,
  fallbackIcon,
  size = 17,
}: SidebarNavIconProps) {
  const visual = SIDEBAR_PAGE_VISUALS[page];
  const accent = visual?.color ?? '#94A3B8';

  return (
    <div
      className={`sidebar-nav-icon-wrap${active ? ' sidebar-nav-icon-wrap--active' : ''}`}
      style={{ '--sidebar-icon-accent': accent } as React.CSSProperties}
    >
      {visual
        ? <visual.Icon size={size} strokeWidth={2} aria-hidden />
        : fallbackIcon
          ? React.cloneElement(fallbackIcon, { width: size, height: size })
          : null}
    </div>
  );
}
