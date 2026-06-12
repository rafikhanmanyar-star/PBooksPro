import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { ICONS } from '../../../constants';
import { ClientVersionInfo } from '../../../components/ui/ClientVersionLabel';
import { getEditionDisplayLabel } from '../../../shared/systemFeatures';
import { useFeatures } from '../../../hooks/useFeatures';
import ThemeSettingsSection from '../components/ThemeSettingsSection';
import type { ExecutiveView } from '../../../types/executiveMobile.types';

type MenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  view?: ExecutiveView;
  action?: () => void;
  destructive?: boolean;
};

export default function ExecutiveProfilePage() {
  const { tenant, user, logout } = useAuth();
  const { setView, isCloudEligible } = useExecutiveMode();
  const { edition } = useFeatures();

  const initials = (user?.name ?? 'U')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Account',
      items: [
        { id: 'org', label: 'Organization', icon: ICONS.building },
        { id: 'my-tx', label: 'My Quick Captures', icon: ICONS.list, view: 'myTransactions' },
        { id: 'reports', label: 'Reports', icon: ICONS.fileText, view: 'reports' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { id: 'notifications', label: 'Notifications', icon: ICONS.bell, view: 'notifications' },
        { id: 'interface', label: 'Interface Mode', icon: ICONS.settings, view: 'settings' },
      ],
    },
    {
      title: 'Support',
      items: [
        { id: 'help', label: 'Help Center', icon: ICONS.info },
        { id: 'privacy', label: 'Privacy Policy', icon: ICONS.shield },
        { id: 'about', label: 'About PBooks Pro', icon: ICONS.info },
      ],
    },
  ];

  return (
    <div className="pb-28 min-h-full bg-app-bg">
      {/* Profile header */}
      <section className="px-4 pt-6 pb-5 bg-app-card border-b border-app-border">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-ds-primary/15 text-ds-primary text-xl font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-app-text truncate">{user?.name}</h1>
            <p className="text-sm text-app-muted truncate">{user?.email ?? user?.username}</p>
            <p className="text-xs text-app-muted mt-0.5 truncate">
              {tenant?.companyName ?? tenant?.name}
            </p>
          </div>
        </div>
      </section>

      <div className="p-4 space-y-5">
        {/* Appearance */}
        <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
          <h2 className="text-sm font-semibold text-app-text mb-3 flex items-center gap-2">
            <span className="w-5 h-5 text-ds-primary">{ICONS.settings}</span>
            Appearance
          </h2>
          <ThemeSettingsSection />
        </section>

        {/* Menu sections */}
        {menuSections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-app-muted mb-2 px-1">
              {section.title}
            </h2>
            <div className="rounded-2xl border border-app-border bg-app-card shadow-ds-card overflow-hidden divide-y divide-app-border">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.view) setView(item.view);
                    else if (item.id === 'org' && isCloudEligible) setView('settings');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left touch-manipulation min-h-[44px] active:bg-app-highlight transition-colors"
                >
                  <span className="w-5 h-5 text-ds-primary shrink-0">{item.icon}</span>
                  <span className="flex-1 text-sm font-medium text-app-text">{item.label}</span>
                  <span className="w-4 h-4 text-app-muted">{ICONS.chevronRight}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {/* About / version */}
        <section className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
          <h2 className="text-sm font-semibold text-app-text mb-2">About</h2>
          {edition && (
            <p className="text-xs text-app-muted mb-2">
              Edition:{' '}
              <span className="font-medium text-app-text">{getEditionDisplayLabel(edition)}</span>
            </p>
          )}
          <ClientVersionInfo />
        </section>

        {/* Logout */}
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full py-3.5 rounded-2xl border border-ds-danger/30 bg-ds-danger/10 text-ds-danger font-semibold text-sm touch-manipulation min-h-[44px] active:scale-[0.98] transition-transform"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
