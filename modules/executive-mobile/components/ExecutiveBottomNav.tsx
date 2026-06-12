import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveView } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { useMobileNotifications } from '../hooks/useMobileNotifications';

const PROFILE_VIEWS: ExecutiveView[] = [
  'profile',
  'settings',
  'reports',
  'myTransactions',
  'moduleList',
  'moduleDashboard',
];

type NavTab = {
  view: ExecutiveView;
  label: string;
  icon: React.ReactNode;
  badge?: number;
};

export default function ExecutiveBottomNav() {
  const { view, setView } = useExecutiveMode();
  const { data: notifications } = useMobileNotifications();
  const notifCount = notifications?.length ?? 0;

  const tabs: NavTab[] = [
    { view: 'home', label: 'Dashboard', icon: ICONS.home },
    { view: 'approvals', label: 'Approvals', icon: ICONS.checkCircle },
    { view: 'quickTransaction', label: 'Capture', icon: ICONS.plus },
    { view: 'notifications', label: 'Alerts', icon: ICONS.bell, badge: notifCount },
    { view: 'profile', label: 'Profile', icon: ICONS.user },
  ];

  const isActive = (itemView: ExecutiveView) => {
    if (itemView === 'profile') return PROFILE_VIEWS.includes(view);
    return view === itemView;
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-app-card border-t border-app-border shadow-ds-header executive-bottom-nav"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}
      aria-label="Executive navigation"
    >
      <div className="grid grid-cols-5 w-full h-[3.75rem] items-center px-1">
        {tabs.map((tab) => (
          <NavItem
            key={tab.view}
            label={tab.label}
            icon={tab.icon}
            active={isActive(tab.view)}
            badge={tab.badge}
            onClick={() => setView(tab.view)}
          />
        ))}
      </div>
    </nav>
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
      className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] touch-manipulation w-full rounded-lg transition-colors duration-200 active:scale-95 ${
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
        <span className="absolute top-0.5 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-ds-danger text-white text-[9px] font-bold flex items-center justify-center leading-none">
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
      {active && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-ds-primary" />
      )}
    </button>
  );
}
