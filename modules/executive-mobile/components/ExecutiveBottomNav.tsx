import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveView } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { useMobileNotifications } from '../hooks/useMobileNotifications';

const BOTTOM_ITEMS: { view: ExecutiveView; label: string; icon: React.ReactNode; badge?: boolean }[] = [
  { view: 'home', label: 'Home', icon: ICONS.home },
  { view: 'approvals', label: 'Approvals', icon: ICONS.checkCircle },
  { view: 'quickTransaction', label: 'Quick Tx', icon: ICONS.plus },
  { view: 'notifications', label: 'Alerts', icon: ICONS.bell, badge: true },
  { view: 'moduleList', label: 'More', icon: ICONS.grid },
];

const MORE_VIEWS: ExecutiveView[] = ['moduleList', 'moduleDashboard', 'reports', 'settings', 'myTransactions'];

export default function ExecutiveBottomNav() {
  const { view, setView } = useExecutiveMode();
  const { data: notifications } = useMobileNotifications();
  const notifCount = notifications?.length ?? 0;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-app-header border-t border-app-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex justify-around items-center h-16">
        {BOTTOM_ITEMS.map((item) => {
          const active =
            item.view === 'moduleList'
              ? MORE_VIEWS.includes(view)
              : view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              className={`relative flex flex-col items-center justify-center flex-1 min-h-[56px] touch-manipulation ${
                active ? 'text-green-600 font-semibold' : 'text-app-muted'
              }`}
            >
              <div className="w-6 h-6">{item.icon}</div>
              {item.badge && notifCount > 0 && (
                <span className="absolute top-1 right-[calc(50%-22px)] min-w-[16px] h-4 px-1 rounded-full bg-ds-danger text-white text-[9px] font-bold flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
