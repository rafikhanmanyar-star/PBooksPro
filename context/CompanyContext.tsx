/**
 * Company Context
 *
 * Manages multi-company state for local-only mode.
 * Gates the app: until a company is opened, no main UI is rendered.
 * Sits above AuthProvider in the provider hierarchy.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isLocalOnlyMode } from '../config/apiUrl';
import { logger } from '../services/logger';
import { applyDisplayTimezoneFromProfile, setDisplayTimeZoneUserContext } from '../utils/dateUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyInfo {
  id: string;
  company_name: string;
  slug: string;
  db_file_path: string;
  created_at: string;
  last_opened_at: string | null;
  is_active: number;
  schema_version: number;
}

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface CompanyUser {
  id: string;
  username: string;
  name: string;
  role: string;
  /** IANA id from SQLite `users.display_timezone`, or null = device local */
  displayTimezone?: string | null;
}

export interface CompanyDbUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email?: string;
  is_active: number;
  force_password_change: number;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  username: string;
  name: string;
  role: string;
  email?: string;
  password?: string;
}

export interface UpdateUserData {
  username: string;
  name: string;
  role: string;
  email?: string;
  password?: string;
}

interface CompanyContextType {
  companies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  pendingCompanyId: string | null;
  isLoading: boolean;
  error: string | null;
  screen: 'loading' | 'select' | 'create' | 'login' | 'app';
  loginUsers: { id: string; username: string }[];
  authenticatedUser: CompanyUser | null;
  forcePasswordChange: boolean;

  refreshCompanies: () => Promise<void>;
  createCompany: (name: string) => Promise<{ ok: boolean; error?: string }>;
  /** Close current company (save data first), then create and open a new company. Use from Settings when already in a company. */
  closeCurrentAndCreateNewCompany: (name: string) => Promise<{ ok: boolean; error?: string }>;
  openCompany: (id: string) => Promise<void>;
  openCompanyByPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  selectAndOpenCompanyFile: () => Promise<{ ok: boolean; error?: string }>;
  selectCompanyFile: () => Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>;
  getCompanyNameFromFile: (filePath: string) => Promise<{ ok: boolean; companyName?: string; error?: string }>;
  copyExternalWithNewName: (sourceFilePath: string, newCompanyName: string) => Promise<{ ok: boolean; companyId?: string; company?: CompanyInfo; error?: string }>;
  switchCompany: () => void;
  logoutCompany: () => Promise<void>;
  deleteCompany: (id: string) => Promise<{ ok: boolean; error?: string }>;
  loginToCompany: (companyId: string, username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  setNewPassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  skipLogin: () => void;

  backupCompany: (id: string) => Promise<{ ok: boolean; backup?: BackupInfo; error?: string }>;
  listBackups: (id: string) => Promise<BackupInfo[]>;
  restoreBackup: (filePath: string) => Promise<{ ok: boolean; error?: string; backupAppVersion?: string; currentAppVersion?: string }>;
  selectBackupFile: () => Promise<{ ok: boolean; filePath?: string }>;

  closeForNewCompany: () => void;
  listUsers: () => Promise<CompanyDbUser[]>;
  createUser: (data: CreateUserData) => Promise<{ ok: boolean; error?: string }>;
  updateUser: (userId: string, data: UpdateUserData) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  resetUserPassword: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Bridge type guard
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    companyBridge?: {
      list: () => Promise<{ ok: boolean; companies?: CompanyInfo[]; error?: string }>;
      create: (name: string) => Promise<{ ok: boolean; company?: CompanyInfo; error?: string }>;
      open: (id: string) => Promise<{ ok: boolean; company?: CompanyInfo; error?: string }>;
      getActive: () => Promise<{ ok: boolean; company: CompanyInfo | null }>;
      selectCompanyFile: () => Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>;
      openFile: (filePath: string) => Promise<{ ok: boolean; company?: CompanyInfo; error?: string }>;
      getCompanyNameFromFile: (filePath: string) => Promise<{ ok: boolean; companyName?: string; error?: string }>;
      copyExternalWithNewName: (sourceFilePath: string, newCompanyName: string) => Promise<{ ok: boolean; companyId?: string; company?: CompanyInfo; error?: string }>;
      delete: (id: string) => Promise<{ ok: boolean; error?: string }>;
      checkCredentials: (id: string) => Promise<{ ok: boolean; requiresLogin?: boolean; users?: { id: string; username: string }[]; error?: string }>;
      login: (id: string, username: string, password: string) => Promise<{ ok: boolean; user?: CompanyUser; forcePasswordChange?: boolean; error?: string }>;
      setPassword: (companyId: string, userId: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
      prepareForBackup: (companyId: string) => Promise<{ ok: boolean; error?: string }>;
      backup: (id: string) => Promise<{ ok: boolean; backup?: BackupInfo; error?: string }>;
      listBackups: (id: string) => Promise<{ ok: boolean; backups?: BackupInfo[]; error?: string }>;
      restore: (filePath: string) => Promise<{ ok: boolean; companyId?: string; companyName?: string; isOverwrite?: boolean; backupAppVersion?: string; currentAppVersion?: string; error?: string }>;
      selectBackupFile: () => Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>;
      closeForCreation: () => Promise<{ ok: boolean; error?: string }>;
      listUsers: () => Promise<{ ok: boolean; users?: CompanyDbUser[]; error?: string }>;
      createUser: (data: CreateUserData) => Promise<{ ok: boolean; userId?: string; error?: string }>;
      updateUser: (userId: string, data: UpdateUserData) => Promise<{ ok: boolean; error?: string }>;
      deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
      resetPassword: (userId: string) => Promise<{ ok: boolean; error?: string }>;
      updateUserDisplayTimezone?: (
        companyId: string,
        userId: string,
        displayTimezone: string | null
      ) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

function hasBridge(): boolean {
  return typeof window !== 'undefined' && !!window.companyBridge;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeCompany, setActiveCompany] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'loading' | 'select' | 'create' | 'login' | 'app'>('loading');
  const [loginUsers, setLoginUsers] = useState<{ id: string; username: string }[]>([]);
  const [authenticatedUser, setAuthenticatedUser] = useState<CompanyUser | null>(null);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);

  // Initial load: check for active company or show selector
  useEffect(() => {
    if (!isLocalOnlyMode() || !hasBridge()) {
      // Not local-only or no bridge: skip company management entirely
      setScreen('app');
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        // Check if there's already an active company (e.g., migrated DB auto-opened by main process)
        const activeResult = await window.companyBridge!.getActive();
        if (activeResult.ok && activeResult.company) {
          const company = activeResult.company;
          setActiveCompany(company);
          // Restore persisted user for this company (after reload following login)
          try {
            const stored = typeof localStorage !== 'undefined' && localStorage.getItem('pbooks_local_auth');
            if (stored) {
              const { companyId, user } = JSON.parse(stored);
              if (companyId === company.id && user?.id && user?.username) {
                setAuthenticatedUser(user);
                setIsLoading(false);
                setScreen('app');
                return;
              }
            }
          } catch (_) {}
          // No persisted user: check credentials and show login when company has users
          const credResult = await window.companyBridge!.checkCredentials(company.id);
          if (credResult.ok && credResult.users && credResult.users.length > 0) {
            setLoginUsers(credResult.users);
            setPendingCompanyId(company.id);
            setScreen('login');
          } else {
            // No users (edge case): treat as default admin
            setAuthenticatedUser({
              id: 'local-user',
              username: 'admin',
              name: 'Administrator',
              role: 'SUPER_ADMIN',
            });
            setScreen('app');
          }
          setIsLoading(false);
          return;
        }

        // No active company — load list from master_index and show selector
        let list: CompanyInfo[] = [];
        let listFailed = false;
        try {
          const listResult = await window.companyBridge!.list();
          list = listResult.ok ? (listResult.companies || []) : [];
          if (!listResult.ok) {
            listFailed = true;
            setError(listResult.error || 'Failed to load companies.');
          }
        } catch (listErr) {
          listFailed = true;
          console.error('[CompanyContext] company:list failed:', listErr);
          setError(listErr instanceof Error ? listErr.message : String(listErr));
        }
        setCompanies(list);
        // Show select screen when companies exist OR when listing failed (so user can browse/create).
        // Only show 'create' for a truly fresh install with zero companies and no errors.
        setScreen(list.length > 0 || listFailed ? 'select' : 'create');
      } catch (err) {
        console.error('[CompanyContext] Init error:', err);
        setError(err instanceof Error ? err.message : String(err));
        setScreen('select');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Scope display timezone cache to this company user (local-only); apply server/SQLite value when present
  useEffect(() => {
    if (!isLocalOnlyMode() || !authenticatedUser?.id) return;
    setDisplayTimeZoneUserContext(authenticatedUser.id);
    if (authenticatedUser.displayTimezone !== undefined) {
      applyDisplayTimezoneFromProfile(authenticatedUser.displayTimezone);
    }
  }, [authenticatedUser]);

  // Electron: handle window close (File → Exit, or X). Must run in a provider that is always mounted
  // so it works on the company select screen (where App is not rendered).
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { onPrepareToClose?: (cb: () => void) => () => void; notifyReadyToClose?: () => void } }).electronAPI;
    if (!api?.onPrepareToClose || !api?.notifyReadyToClose) return;
    const unsubscribe = api.onPrepareToClose(() => {
      // On company select/create or no company open, nothing to save — close immediately
      if (screen === 'select' || screen === 'create' || !activeCompany) {
        api.notifyReadyToClose!();
        return;
      }
      // Otherwise save state then close (same flow as App.tsx)
      new Promise<void>((resolve) => {
        const done = () => {
          window.removeEventListener('state-saved-for-logout', done);
          resolve();
        };
        window.addEventListener('state-saved-for-logout', done);
        window.dispatchEvent(new CustomEvent('save-state-before-logout'));
        setTimeout(() => {
          window.removeEventListener('state-saved-for-logout', done);
          resolve();
        }, 30000);
      }).then(async () => {
        try {
          const { stabilityDbCheckpoint } = await import('../services/stability/stabilityLayer');
          await stabilityDbCheckpoint();
        } catch {
          /* ignore */
        }
        api.notifyReadyToClose!();
      });
    });
    return unsubscribe;
  }, [screen, activeCompany]);

  const refreshCompanies = useCallback(async () => {
    if (!hasBridge()) return;
    try {
      const result = await window.companyBridge!.list();
      if (result.ok) setCompanies(result.companies || []);
    } catch (err) {
      console.error('[CompanyContext] Refresh error:', err);
    }
  }, []);

  const createCompany = useCallback(async (name: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Company bridge not available.' };
    try {
      const result = await window.companyBridge!.create(name);
      if (!result.ok) return { ok: false, error: result.error };

      // Open the newly created company
      const openResult = await window.companyBridge!.open(result.company!.id);
      if (!openResult.ok) return { ok: false, error: openResult.error };

      setActiveCompany(openResult.company!);
      setAuthenticatedUser({
        id: 'local-user',
        username: 'admin',
        name: 'Administrator',
        role: 'SUPER_ADMIN',
      });
      setForcePasswordChange(true);
      setScreen('app');

      // Reload to ensure clean state with new DB
      window.location.reload();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  /**
   * Close the current company (save in-memory data first), then create and open a new company.
   * Used when creating a new company from Settings → Company Management while already logged in.
   */
  const closeCurrentAndCreateNewCompany = useCallback(async (name: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Company bridge not available.' };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Company name is required.' };

    try {
      // 1. Save any in-memory/in-process data to the current company DB
      await new Promise<void>((resolve) => {
        const handleDone = () => {
          window.removeEventListener('state-saved-for-logout', handleDone);
          resolve();
        };
        window.addEventListener('state-saved-for-logout', handleDone);
        window.dispatchEvent(new CustomEvent('save-state-before-logout'));
        setTimeout(() => {
          window.removeEventListener('state-saved-for-logout', handleDone);
          resolve();
        }, 30000);
      });

      // 2. Clear persisted auth and close the company DB
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pbooks_local_auth');
      }
      await window.companyBridge!.closeForCreation();
      setActiveCompany(null);
      setAuthenticatedUser(null);
      setForcePasswordChange(false);
      setPendingCompanyId(null);
      setLoginUsers([]);

      // 3. Create the new company (blank DB)
      const createResult = await window.companyBridge!.create(trimmed);
      if (!createResult.ok) return { ok: false, error: createResult.error };

      // 4. Open the new company
      const openResult = await window.companyBridge!.open(createResult.company!.id);
      if (!openResult.ok) return { ok: false, error: openResult.error };

      // 5. Set state and persist so after reload we're in the new company
      setActiveCompany(openResult.company!);
      const defaultUser = {
        id: 'local-user',
        username: 'admin',
        name: 'Administrator',
        role: 'SUPER_ADMIN' as const,
      };
      setAuthenticatedUser(defaultUser);
      setForcePasswordChange(true);
      setScreen('app');
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pbooks_local_auth', JSON.stringify({
          companyId: createResult.company!.id,
          user: defaultUser,
        }));
      }

      // 6. Reload to load the new company data
      window.location.reload();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const openCompany = useCallback(async (id: string) => {
    if (!hasBridge()) return;
    setError(null);
    setPendingCompanyId(id);

    try {
      // If already in a different company, save and close first so no data is lost (persistence audit fix)
      if (activeCompany && activeCompany.id !== id) {
        logger.logCategory('database', `[CompanyContext] company switch: saving state before switching from ${activeCompany.id} to ${id}`);
        await new Promise<void>((resolve) => {
          const handleDone = () => {
            window.removeEventListener('state-saved-for-logout', handleDone);
            resolve();
          };
          window.addEventListener('state-saved-for-logout', handleDone);
          window.dispatchEvent(new CustomEvent('save-state-before-logout'));
          setTimeout(() => {
            window.removeEventListener('state-saved-for-logout', handleDone);
            resolve();
          }, 30000);
        });
        await window.companyBridge!.closeForCreation();
        logger.logCategory('database', `[CompanyContext] company switch: closed previous company, opening ${id}`);
      }

      // When company has users, always show login so user selects identity (credentials checked from local DB)
      const credResult = await window.companyBridge!.checkCredentials(id);
      if (credResult.ok && credResult.users && credResult.users.length > 0) {
        setLoginUsers(credResult.users);
        setScreen('login');
        return;
      }

      // No users (edge case): open directly as default admin
      const result = await window.companyBridge!.open(id);
      if (!result.ok) {
        setError(result.error || 'Failed to open company.');
        return;
      }

      setActiveCompany(result.company!);
      setAuthenticatedUser({
        id: 'local-user',
        username: 'admin',
        name: 'Administrator',
        role: 'SUPER_ADMIN',
      });

      // Reload to initialize all services with the new DB
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeCompany]);

  const openCompanyByPath = useCallback(async (filePath: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    setError(null);
    try {
      const result = await window.companyBridge!.openFile(filePath);
      if (!result.ok || !result.company) {
        return { ok: false, error: result.error || 'Failed to open company file.' };
      }
      const company = result.company;
      const credResult = await window.companyBridge!.checkCredentials(company.id);
      if (credResult.ok && credResult.users && credResult.users.length > 0) {
        setLoginUsers(credResult.users);
        setPendingCompanyId(company.id);
        setScreen('login');
        return { ok: true };
      }
      setActiveCompany(company);
      setAuthenticatedUser({
        id: 'local-user',
        username: 'admin',
        name: 'Administrator',
        role: 'SUPER_ADMIN',
      });
      window.location.reload();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  const selectAndOpenCompanyFile = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    const selectResult = await window.companyBridge!.selectCompanyFile();
    if (!selectResult.ok || selectResult.canceled || !selectResult.filePath) {
      return { ok: true };
    }
    return openCompanyByPath(selectResult.filePath);
  }, [openCompanyByPath]);

  const selectCompanyFile = useCallback(async (): Promise<{ ok: boolean; filePath?: string; canceled?: boolean }> => {
    if (!hasBridge()) return { ok: false };
    return window.companyBridge!.selectCompanyFile();
  }, []);

  const getCompanyNameFromFile = useCallback(async (filePath: string): Promise<{ ok: boolean; companyName?: string; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    try {
      return await window.companyBridge!.getCompanyNameFromFile(filePath);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const copyExternalWithNewName = useCallback(async (sourceFilePath: string, newCompanyName: string): Promise<{ ok: boolean; companyId?: string; company?: CompanyInfo; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    try {
      return await window.companyBridge!.copyExternalWithNewName(sourceFilePath, newCompanyName);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const loginToCompany = useCallback(async (companyId: string, username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    try {
      const result = await window.companyBridge!.login(companyId, username, password);
      if (!result.ok) return { ok: false, error: result.error };

      // Login succeeded - now open the company DB
      const openResult = await window.companyBridge!.open(companyId);
      if (!openResult.ok) return { ok: false, error: openResult.error };

      const user = result.user!;
      setActiveCompany(openResult.company!);
      setAuthenticatedUser(user);
      setForcePasswordChange(!!result.forcePasswordChange);

      // Persist user so after reload we stay logged in (credentials are in local DB)
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('pbooks_local_auth', JSON.stringify({
            companyId,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              role: user.role,
              displayTimezone: user.displayTimezone ?? null,
            },
          }));
        }
      } catch (_) {}

      // Reload to initialize with the new DB
      window.location.reload();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const setNewPassword = useCallback(async (newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge() || !activeCompany || !authenticatedUser) {
      return { ok: false, error: 'No active session.' };
    }
    try {
      const result = await window.companyBridge!.setPassword(activeCompany.id, authenticatedUser.id, newPassword);
      if (result.ok) {
        setForcePasswordChange(false);
      }
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [activeCompany, authenticatedUser]);

  const skipLogin = useCallback(() => {
    setScreen('select');
    setPendingCompanyId(null);
    setLoginUsers([]);
  }, []);

  const switchCompany = useCallback(async () => {
    // Save in-memory data (e.g. service charges, reports) to DB before closing company
    const resetState = () => {
      setActiveCompany(null);
      setAuthenticatedUser(null);
      setForcePasswordChange(false);
      setPendingCompanyId(null);
      setLoginUsers([]);
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('pbooks_local_auth');
      } catch (_) {}
    };

    if (hasBridge()) {
      try {
        // Save state to DB before closing (same as logout) so data is not lost
        await new Promise<void>((resolve) => {
          const handleDone = () => {
            window.removeEventListener('state-saved-for-logout', handleDone);
            resolve();
          };
          window.addEventListener('state-saved-for-logout', handleDone);
          window.dispatchEvent(new CustomEvent('save-state-before-logout'));
          setTimeout(() => {
            window.removeEventListener('state-saved-for-logout', handleDone);
            resolve();
          }, 30000);
        });
        await window.companyBridge!.closeForCreation();
      } catch (err) {
        console.error('[CompanyContext] switchCompany close failed:', err);
      }
      resetState();
      // Refresh the company list from master_index and show selector
      try {
        const listResult = await window.companyBridge!.list();
        const list = listResult.ok ? (listResult.companies || []) : [];
        setCompanies(list);
        setScreen(list.length > 0 ? 'select' : 'create');
      } catch {
        setScreen('select');
      }
    } else {
      resetState();
      setScreen('select');
    }
  }, []);

  /**
   * Logout from current company: save any in-memory/in-process transactions to DB,
   * close the company DB, then show the company select/create screen again.
   */
  const logoutCompany = useCallback(async () => {
    const resetState = () => {
      setActiveCompany(null);
      setAuthenticatedUser(null);
      setForcePasswordChange(false);
      setPendingCompanyId(null);
      setLoginUsers([]);
    };

    if (!hasBridge()) {
      resetState();
      setScreen('select');
      return;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pbooks_local_auth');
      }
      const savePromise = new Promise<void>((resolve) => {
        const handleDone = () => {
          window.removeEventListener('state-saved-for-logout', handleDone);
          resolve();
        };
        window.addEventListener('state-saved-for-logout', handleDone);
        window.dispatchEvent(new CustomEvent('save-state-before-logout'));
        setTimeout(() => {
          window.removeEventListener('state-saved-for-logout', handleDone);
          resolve();
        }, 30000);
      });
      await savePromise;
      await window.companyBridge!.closeForCreation();
    } catch (err) {
      console.error('[CompanyContext] logoutCompany error:', err);
    } finally {
      resetState();
      try {
        const listResult = await window.companyBridge!.list();
        const list = listResult.ok ? (listResult.companies || []) : [];
        setCompanies(list);
        setScreen(list.length > 0 ? 'select' : 'create');
      } catch {
        setScreen('select');
      }
    }
  }, []);

  const deleteCompany = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    try {
      const result = await window.companyBridge!.delete(id);
      if (result.ok) await refreshCompanies();
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [refreshCompanies]);

  // Backup/restore
  const backupCompany = useCallback(async (id: string) => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' } as any;
    return window.companyBridge!.backup(id);
  }, []);

  const listBackups = useCallback(async (id: string): Promise<BackupInfo[]> => {
    if (!hasBridge()) return [];
    const result = await window.companyBridge!.listBackups(id);
    return result.ok ? (result.backups || []) : [];
  }, []);

  const restoreBackup = useCallback(async (filePath: string): Promise<{ ok: boolean; error?: string; backupAppVersion?: string; currentAppVersion?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    const result = await window.companyBridge!.restore(filePath);
    if (result.ok) {
      await refreshCompanies();
      window.location.reload();
    }
    return {
      ok: result.ok,
      error: result.error,
      backupAppVersion: result.backupAppVersion,
      currentAppVersion: result.currentAppVersion,
    };
  }, [refreshCompanies]);

  const selectBackupFile = useCallback(async (): Promise<{ ok: boolean; filePath?: string }> => {
    if (!hasBridge()) return { ok: false };
    return window.companyBridge!.selectBackupFile();
  }, []);

  const closeForNewCompany = useCallback(async () => {
    if (!hasBridge()) return;
    try {
      await window.companyBridge!.closeForCreation();
    } catch (err) {
      console.error('[CompanyContext] closeForNewCompany failed:', err);
    }
    setActiveCompany(null);
    setAuthenticatedUser(null);
    setForcePasswordChange(false);
    setPendingCompanyId(null);
    setLoginUsers([]);
    setScreen('create');
  }, []);

  // User management
  const listUsersMethod = useCallback(async (): Promise<CompanyDbUser[]> => {
    if (!hasBridge()) return [];
    const result = await window.companyBridge!.listUsers();
    return result.ok ? (result.users || []) : [];
  }, []);

  const createUserMethod = useCallback(async (data: CreateUserData): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    return window.companyBridge!.createUser(data);
  }, []);

  const updateUserMethod = useCallback(async (userId: string, data: UpdateUserData): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    return window.companyBridge!.updateUser(userId, data);
  }, []);

  const deleteUserMethod = useCallback(async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    return window.companyBridge!.deleteUser(userId);
  }, []);

  const resetUserPasswordMethod = useCallback(async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!hasBridge()) return { ok: false, error: 'Bridge not available.' };
    return window.companyBridge!.resetPassword(userId);
  }, []);

  const value: CompanyContextType = {
    companies,
    activeCompany,
    pendingCompanyId,
    isLoading,
    error,
    screen,
    loginUsers,
    authenticatedUser,
    forcePasswordChange,
    refreshCompanies,
    createCompany,
    closeCurrentAndCreateNewCompany,
    openCompany,
    openCompanyByPath,
    selectAndOpenCompanyFile,
    selectCompanyFile,
    getCompanyNameFromFile,
    copyExternalWithNewName,
    switchCompany,
    logoutCompany,
    deleteCompany,
    loginToCompany,
    setNewPassword,
    skipLogin,
    backupCompany,
    listBackups,
    restoreBackup,
    selectBackupFile,
    closeForNewCompany,
    listUsers: listUsersMethod,
    createUser: createUserMethod,
    updateUser: updateUserMethod,
    deleteUser: deleteUserMethod,
    resetUserPassword: resetUserPasswordMethod,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
};

/** Safe variant that returns null when outside CompanyProvider (for optional integration). */
export const useCompanyOptional = (): CompanyContextType | null => {
  return useContext(CompanyContext) ?? null;
};
