import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { ICONS } from '../../../constants';
import pbooksProLogo from '../../../pbookspro logo.png';
import ExecutiveMobileMenu from './ExecutiveMobileMenu';

type Props = {
  notifCount?: number;
};

export default function ExecutiveCommandHeader({ notifCount = 0 }: Props) {
  const { user } = useAuth();
  const { setView } = useExecutiveMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.name ?? 'U').slice(0, 2).toUpperCase();

  return (
    <>
      <header className="executive-v2-header sticky top-0 z-30 px-4 py-3 flex items-center gap-3 bg-app-card/95 border-b border-app-border/60 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-app-muted touch-manipulation active:bg-app-highlight shrink-0"
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img
            src={pbooksProLogo}
            alt="PBooks Pro"
            className="w-9 h-9 rounded-lg object-cover shrink-0 executive-v2-logo"
          />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight truncate executive-v2-brand">
              <span className="text-red-500">P</span>
              <span className="text-ds-primary">Books</span>
              <span className="text-app-text">Pro</span>
            </p>
            <p className="text-[10px] text-app-muted font-medium tracking-wide">Executive View</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setView('inbox')}
          className="relative w-11 h-11 rounded-xl border border-app-border/60 bg-app-card flex items-center justify-center text-app-muted touch-manipulation shrink-0"
          aria-label="Executive inbox"
        >
          <span className="w-5 h-5">{ICONS.bell}</span>
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-ds-danger text-white text-[10px] font-bold flex items-center justify-center">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setView('profile')}
          className="executive-user-avatar w-11 h-11 rounded-full text-xs font-bold flex items-center justify-center touch-manipulation shrink-0"
          aria-label="Profile"
        >
          {initials}
        </button>
      </header>

      <ExecutiveMobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
