import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveView } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { useMobileNotifications } from '../hooks/useMobileNotifications';

const SIDE_ITEMS: { view: ExecutiveView; label: string; icon: React.ReactNode; badge?: boolean }[] = [
  { view: 'home', label: 'Home', icon: ICONS.home },
  { view: 'approvals', label: 'Approvals', icon: ICONS.checkCircle },
  { view: 'notifications', label: 'Alerts', icon: ICONS.bell, badge: true },
  { view: 'moduleList', label: 'More', icon: ICONS.grid },
];

const MORE_VIEWS: ExecutiveView[] = ['moduleList', 'moduleDashboard', 'reports', 'settings', 'myTransactions'];

export default function ExecutiveBottomNav() {
  const { view, setView } = useExecutiveMode();
  const { data: notifications } = useMobileNotifications();
  const notifCount = notifications?.length ?? 0;

  const isActive = (itemView: ExecutiveView) => {
    if (itemView === 'moduleList') return MORE_VIEWS.includes(view);
    return view === itemView;
  };

  const quickActive = view === 'quickTransaction';

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-app-header border-t border-app-border shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="relative flex items-end justify-around h-[4.5rem] px-2 max-w-lg mx-auto">
        {/* Home */}
        <NavItem
          label="Home"
          icon={ICONS.home}
          active={isActive('home')}
          onClick={() => setView('home')}
        />

        {/* Approvals */}
        <NavItem
          label="Approvals"
          icon={ICONS.checkCircle}
          active={isActive('approvals')}
          onClick={() => setView('approvals')}
        />

        {/* Center FAB — Quick Tx */}
        <div className="flex flex-col items-center justify-end flex-1 -mt-6">
          <button
            type="button"
            onClick={() => setView('quickTransaction')}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg touch-manipulation transition-transform active:scale-95 ${
              quickActive
                ? 'bg-emerald-700 ring-4 ring-emerald-200 dark:ring-emerald-900'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
            aria-label="Quick transaction"
          >
            <span className="w-7 h-7 text-white">{ICONS.plus}</span>
          </button>
          <span
            className={`text-[10px] mt-1 font-medium ${
              quickActive ? 'text-emerald-600' : 'text-app-muted'
            }`}
          >
            Quick Tx
          </span>
        </div>

        {/* Alerts */}
        <NavItem
          label="Alerts"
          icon={ICONS.bell}
          active={isActive('notifications')}
          onClick={() => setView('notifications')}
          badge={notifCount}
        />

        {/* More */}
        <NavItem
          label="More"
          icon={ICONS.grid}
          active={isActive('moduleList')}
          onClick={() => setView('moduleList')}
        />
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
      className={`relative flex flex-col items-center justify-center flex-1 min-h-[52px] pb-1 touch-manipulation ${
        active ? 'text-emerald-600' : 'text-app-muted'
      }`}
    >
      <span className={`w-6 h-6 ${active ? 'text-emerald-600' : ''}`}>{icon}</span>
      {badge > 0 && (
        <span className="absolute top-0 right-[calc(50%-20px)] min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span className={`text-[10px] mt-0.5 ${active ? 'font-semibold' : ''}`}>{label}</span>
    </button>
  );
}
