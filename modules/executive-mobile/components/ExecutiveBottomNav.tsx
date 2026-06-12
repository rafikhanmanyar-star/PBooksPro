import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveView } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { useMobileNotifications } from '../hooks/useMobileNotifications';

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
      className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-app-header border-t border-app-border shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Executive navigation"
    >
      <div className="relative w-full h-[4.25rem]">
        {/* Center FAB — floats above the bar */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            type="button"
            onClick={() => setView('quickTransaction')}
            aria-label="Quick transaction"
            aria-current={quickActive ? 'page' : undefined}
            className={`w-[3.25rem] h-[3.25rem] rounded-full flex items-center justify-center touch-manipulation transition-all duration-200 active:scale-95 shadow-[0_4px_14px_rgba(5,150,105,0.45)] border-[3px] border-white dark:border-app-header ${
              quickActive
                ? 'bg-emerald-700 ring-2 ring-emerald-400/60 dark:ring-emerald-500/40'
                : 'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'
            }`}
          >
            <span className="w-7 h-7 text-white drop-shadow-sm">{ICONS.plus}</span>
          </button>
        </div>

        {/* Five equal columns across full width */}
        <div className="grid grid-cols-5 w-full h-full items-end pb-1.5 px-0">
          <NavItem
            label="Home"
            icon={ICONS.home}
            active={isActive('home')}
            onClick={() => setView('home')}
          />
          <NavItem
            label="Approvals"
            icon={ICONS.checkCircle}
            active={isActive('approvals')}
            onClick={() => setView('approvals')}
          />
          <QuickTxLabel active={quickActive} onClick={() => setView('quickTransaction')} />
          <NavItem
            label="Alerts"
            icon={ICONS.bell}
            active={isActive('notifications')}
            onClick={() => setView('notifications')}
            badge={notifCount}
          />
          <NavItem
            label="More"
            icon={ICONS.grid}
            active={isActive('moduleList')}
            onClick={() => setView('moduleList')}
          />
        </div>
      </div>
    </nav>
  );
}

function QuickTxLabel({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-end pt-7 min-h-[52px] touch-manipulation"
      aria-label="Quick transaction"
    >
      <span
        className={`text-[10px] font-medium leading-tight ${
          active ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-app-muted'
        }`}
      >
        Quick Tx
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
      className={`relative flex flex-col items-center justify-end min-h-[52px] pb-0.5 touch-manipulation w-full ${
        active ? 'text-emerald-600 dark:text-emerald-400' : 'text-app-muted'
      }`}
    >
      <span className={`w-6 h-6 shrink-0 ${active ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {icon}
      </span>
      {badge > 0 && (
        <span className="absolute top-0 left-1/2 ml-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span className={`text-[10px] mt-0.5 leading-tight truncate max-w-full px-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );
}
