import React, { useState, memo, useEffect, useCallback, useMemo, useTransition } from 'react';
import {
  useCurrentUser,
  useDispatchOnly,
  useStateSelector,
  selectCurrentPage,
  selectInitialTabs,
} from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import GlobalSearchBar from './GlobalSearchBar';
import HelpModal from './HelpModal';
import ConnectionStatusIndicator from '../ui/ConnectionStatusIndicator';
import SyncStatusIndicator from '../ui/SyncStatusIndicator';
import SyncProgressBar from '../ui/SyncProgressBar';
import { isStagingEnvironment } from '../../config/apiUrl';
import { useExecutiveModeOptional } from '../../context/ExecutiveModeContext';
import { useViewport } from '../../context/ViewportContext';
import { useTheme } from '../../context/ThemeContext';
import { BookOpen } from 'lucide-react';
import { getModuleHelp } from '../../shared/moduleHelp/moduleHelpContent';
import { resolveModuleHelpContext } from '../../shared/moduleHelp/resolveModuleHelpContext';
import HeaderNotificationsBell from './header/HeaderNotificationsBell';
import HeaderWhatsAppBadge from './header/HeaderWhatsAppBadge';

interface HeaderProps {
  title: string;
  isNavigating?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, isNavigating = false }) => {
  const { theme, toggleTheme } = useTheme();
  const dispatch = useDispatchOnly();
  const [, startNavTransition] = useTransition();
  const currentUser = useCurrentUser();
  const currentPage = useStateSelector(selectCurrentPage);
  const initialTabs = useStateSelector(selectInitialTabs);
  const { isAuthenticated, tenant, startCompanySwitch } = useAuth();
  const { isMobileViewport } = useViewport();
  const executiveMode = useExecutiveModeOptional();
  const showExecutiveViewLink =
    isAuthenticated &&
    isMobileViewport &&
    executiveMode?.isCloudEligible &&
    !executiveMode.isExecutiveMobileActive;

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [helpContextKey, setHelpContextKey] = useState('general');

  const resolvedHelpEntry = useMemo(
    () => getModuleHelp(resolveModuleHelpContext(currentPage, initialTabs)),
    [currentPage, initialTabs]
  );
  const helpTooltip =
    resolvedHelpEntry.id !== 'general'
      ? `Help: ${resolvedHelpEntry.title}`
      : 'Help & module guide';

  const openHelpModal = useCallback(() => {
    const contextKey = resolveModuleHelpContext(currentPage, initialTabs);
    setHelpContextKey(contextKey);
    setIsHelpModalOpen(true);
  }, [currentPage, initialTabs]);

  const handleBreadcrumbHome = useCallback(() => {
    startNavTransition(() => {
      dispatch({ type: 'SET_PAGE', payload: 'dashboard' });
    });
  }, [dispatch, startNavTransition]);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.innerWidth < 768) {
          setIsMobileSearchOpen(true);
        }
        window.setTimeout(() => {
          const input = document.getElementById('global-search-input') as HTMLInputElement | null;
          input?.focus();
        }, 50);
      }
    };
    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 bg-app-header border-b border-app-border shadow-ds-header transition-all duration-ds">
        {isStagingEnvironment() && (
          <div className="w-full bg-amber-500 text-amber-950 text-center py-1 text-xs font-semibold tracking-wider">
            STAGING — test environment (not production)
          </div>
        )}
        {isNavigating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-pulse" />
        )}

        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 rounded-lg text-app-muted hover:bg-black/5 dark:hover:bg-white/10 min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
              aria-label="Toggle sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg font-bold text-app-text leading-tight md:hidden truncate">
                  {title}
                </h1>
                {showExecutiveViewLink && (
                  <button
                    type="button"
                    onClick={() => void executiveMode?.returnToExecutiveMobile()}
                    className="md:hidden shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 touch-manipulation"
                  >
                    Executive
                  </button>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2 text-sm text-app-muted min-h-[1.25rem]">
                <button
                  type="button"
                  className="hover:text-app-text cursor-pointer transition-colors bg-transparent border-0 p-0 font-inherit"
                  onClick={handleBreadcrumbHome}
                >
                  Home
                </button>
                <span className="text-app-muted/50">/</span>
                <span className="font-medium text-app-text">{title}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-xl justify-center">
            <GlobalSearchBar className="max-w-md" />
          </div>

          <div className="flex items-center gap-2 sm:gap-4 justify-end flex-1">
            {isAuthenticated && tenant && (
              <button
                type="button"
                onClick={() => void startCompanySwitch()}
                className="hidden sm:flex items-center gap-1.5 max-w-[200px] truncate rounded-lg border border-app-border bg-app-card px-3 py-1.5 text-sm font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title="Switch organization"
              >
                <span className="truncate">{tenant.companyName || tenant.name}</span>
                <span className="text-app-muted" aria-hidden>
                  ▼
                </span>
              </button>
            )}

            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-app-card border border-app-border">
              <ConnectionStatusIndicator showLabel={true} />
              <div className="h-4 w-px bg-app-border mx-1" />
              <SyncStatusIndicator showDetails={false} />
              <SyncProgressBar
                className={`ml-2 ${typeof window !== 'undefined' && (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron ? 'flex' : 'hidden lg:flex'}`}
              />
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-full text-app-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center shrink-0"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <span className="text-lg leading-none select-none" aria-hidden>
                {theme === 'dark' ? '☀️' : '🌙'}
              </span>
            </button>

            <HeaderNotificationsBell currentUser={currentUser} />
            <HeaderWhatsAppBadge />

            <button
              onClick={openHelpModal}
              className={`p-2 rounded-full transition-colors min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center ${
                isHelpModalOpen
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-800'
                  : 'text-app-muted hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}
              title={helpTooltip}
              aria-label={helpTooltip}
              aria-expanded={isHelpModalOpen}
            >
              <BookOpen className="w-5 h-5" strokeWidth={2} aria-hidden />
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileSearchOpen((prev) => !prev)}
                className="p-2 md:hidden text-app-muted min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
                aria-label="Search"
                aria-expanded={isMobileSearchOpen}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {isMobileSearchOpen && (
          <div className="md:hidden px-4 pb-3 border-t border-app-border bg-app-header">
            <GlobalSearchBar autoFocus onClose={() => setIsMobileSearchOpen(false)} />
          </div>
        )}
      </header>

      {isHelpModalOpen && (
        <HelpModal
          isOpen={isHelpModalOpen}
          onClose={() => setIsHelpModalOpen(false)}
          helpContextKey={helpContextKey}
        />
      )}
    </>
  );
};

export default memo(Header);
