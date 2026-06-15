import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveView } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import { useMobileApprovals } from '../hooks/useMobileApprovals';

type NavTab = {
  view: ExecutiveView;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  capture?: boolean;
};

export default function ExecutiveBottomNav() {
  const { view, setView } = useExecutiveMode();
  const { data: notifications } = useMobileNotifications();
  const { data: approvals } = useMobileApprovals();
  const notifCount = notifications?.length ?? 0;
  const approvalCount = (approvals ?? []).filter((item) => item.canApprove).length;

  const tabs: NavTab[] = [
    { view: 'home', label: 'Dashboard', icon: ICONS.home },
    { view: 'approvals', label: 'Approvals', icon: ICONS.checkCircle, badge: approvalCount },
    { view: 'quickTransaction', label: 'Capture', icon: ICONS.plus, capture: true },
    { view: 'reports', label: 'Reports', icon: ICONS.barChart },
    { view: 'inbox', label: 'Alerts', icon: ICONS.bell, badge: notifCount },
  ];

  const isActive = (itemView: ExecutiveView) => view === itemView;

  return (
    <nav
      className="shrink-0 z-50 bg-app-card/95 border-t border-app-border/60 shadow-ds-header executive-bottom-nav"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}
      aria-label="Executive navigation"
    >
      <div className="grid grid-cols-5 w-full h-[4rem] items-end px-1 pb-1">
        {tabs.map((tab) =>
          tab.capture ? (
            <CaptureFab
              key={tab.view}
              label={tab.label}
              active={isActive(tab.view)}
              onClick={() => setView(tab.view)}
            />
          ) : (
            <NavItem
              key={tab.view}
              label={tab.label}
              icon={tab.icon}
              active={isActive(tab.view)}
              badge={tab.badge}
              onClick={() => setView(tab.view)}
            />
          )
        )}
      </div>
    </nav>
  );
}

function CaptureFab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-col items-center justify-end gap-1 touch-manipulation w-full -mt-3"
    >
      <span
        className={`executive-capture-fab flex items-center justify-center rounded-2xl transition-transform active:scale-95 ${
          active ? 'ring-2 ring-ds-primary/40 ring-offset-2 ring-offset-app-bg' : ''
        }`}
      >
        <span className="w-7 h-7">{ICONS.plus}</span>
      </span>
      <span
        className={`text-[10px] leading-tight ${
          active ? 'font-semibold text-ds-primary' : 'font-medium text-app-muted'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
  badge = 0,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center justify-end gap-1 min-h-[44px] min-w-[44px] touch-manipulation w-full pb-0.5 rounded-lg transition-colors duration-200 active:scale-95 ${
        active ? 'text-ds-primary' : 'text-app-muted'
      }`}
    >
      <span
        className={`w-6 h-6 shrink-0 transition-transform duration-200 ${
          active ? 'text-ds-primary scale-110' : ''
        }`}
      >
        {icon}
      </span>
      {badge > 0 && (
        <span className="absolute top-0 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-ds-danger text-white text-[9px] font-bold flex items-center justify-center leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span
        className={`text-[10px] leading-tight truncate max-w-full px-0.5 ${
          active ? 'font-semibold' : 'font-medium'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
