import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { ICONS } from '../../../constants';
import { ClientVersionLabel } from '../../../components/ui/ClientVersionLabel';
import type { Page } from '../../../types';

type Props = {
  notifCount: number;
  onExitToFullErp?: (page?: Page) => void;
};

export default function ExecutiveHeader({ notifCount, onExitToFullErp }: Props) {
  const { tenant, user, logout } = useAuth();
  const { setView } = useExecutiveMode();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (user?.name ?? 'U')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-white dark:bg-app-header shrink-0 shadow-sm">
        <button
          type="button"
          className="p-2 -ml-2 text-app-text touch-manipulation rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="w-6 h-6 block">{ICONS.list}</span>
        </button>

        <button
          type="button"
          className="flex-1 min-w-0 text-center touch-manipulation"
          onClick={() => setView('settings')}
        >
          <p className="text-[11px] text-app-muted leading-tight">PBooks Pro Executive</p>
          <p className="text-sm font-semibold text-app-text truncate flex items-center justify-center gap-0.5">
            {tenant?.companyName ?? tenant?.name ?? 'Company'}
            <span className="w-4 h-4 text-app-muted shrink-0">{ICONS.chevronDown}</span>
          </p>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="relative p-2 text-app-muted touch-manipulation rounded-full hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setView('notifications')}
            aria-label="Notifications"
          >
            <span className="w-5 h-5 block">{ICONS.bell}</span>
            {notifCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-app-header">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center touch-manipulation"
            onClick={() => setView('settings')}
            aria-label="Profile"
          >
            {initials}
          </button>
        </div>
      </header>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-0 left-0 z-50 w-72 max-w-[85vw] h-full bg-white dark:bg-app-card shadow-xl border-r border-app-border flex flex-col">
            <div className="px-4 py-5 border-b border-app-border">
              <p className="text-xs text-app-muted">PBooks Pro Executive</p>
              <p className="font-semibold text-app-text truncate">{tenant?.companyName ?? tenant?.name}</p>
              <p className="text-sm text-app-muted mt-1">{user?.name}</p>
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {[
                { label: 'Home', action: () => setView('home') },
                { label: 'My transactions', action: () => setView('myTransactions') },
                { label: 'Approvals', action: () => setView('approvals') },
                { label: 'Reports', action: () => setView('reports') },
                { label: 'All modules', action: () => setView('moduleList') },
                { label: 'Settings', action: () => setView('settings') },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="w-full text-left px-4 py-3 rounded-xl text-sm text-app-text hover:bg-emerald-50 dark:hover:bg-emerald-950/30 touch-manipulation"
                  onClick={() => {
                    item.action();
                    setMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-app-border space-y-2">
              <p className="text-center text-[10px] text-app-muted pb-1">
                <ClientVersionLabel />
              </p>
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-sm font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 touch-manipulation"
                onClick={() => {
                  onExitToFullErp?.('dashboard');
                  setMenuOpen(false);
                }}
              >
                Open full ERP
              </button>
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-sm text-app-muted touch-manipulation"
                onClick={() => {
                  void logout();
                  setMenuOpen(false);
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
