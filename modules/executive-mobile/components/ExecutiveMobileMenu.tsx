import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { ExecutiveView } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';

type Props = {
  open: boolean;
  onClose: () => void;
};

const LINKS: { view: ExecutiveView; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: 'Command Center', icon: ICONS.home },
  { view: 'cashPosition', label: 'Cash Position', icon: ICONS.wallet },
  { view: 'constructionDashboard', label: 'Construction Health', icon: ICONS.building },
  { view: 'approvals', label: 'Approval Center', icon: ICONS.checkCircle },
  { view: 'inbox', label: 'Executive Inbox', icon: ICONS.bell },
  { view: 'reports', label: 'Executive Reports', icon: ICONS.fileText },
  { view: 'myTransactions', label: 'My Quick Captures', icon: ICONS.list },
  { view: 'profile', label: 'Profile & Settings', icon: ICONS.settings },
];

export default function ExecutiveMobileMenu({ open, onClose }: Props) {
  const { setView } = useExecutiveMode();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={onClose} />
      <aside className="relative w-72 max-w-[85vw] h-full bg-app-card border-r border-app-border shadow-2xl flex flex-col animate-slide-in-left">
        <div className="px-4 py-4 border-b border-app-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">Executive Menu</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {LINKS.map((link) => (
            <button
              key={link.view}
              type="button"
              onClick={() => {
                setView(link.view);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left touch-manipulation hover:bg-app-highlight active:bg-app-highlight"
            >
              <span className="w-5 h-5 text-ds-primary shrink-0">{link.icon}</span>
              <span className="text-sm font-medium text-app-text">{link.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
