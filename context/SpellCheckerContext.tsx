import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { installAutocorrect } from '../utils/spellAutocorrect';

export type SpellCheckerSettings = {
  spellcheckEnabled: boolean;
  spellcheckerLanguage: string;
  autocorrectEnabled: boolean;
};

export const SPELLCHECK_LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'en-CA', label: 'English (Canada)' },
] as const;

const defaultSettings: SpellCheckerSettings = {
  spellcheckEnabled: true,
  spellcheckerLanguage: 'en-US',
  autocorrectEnabled: false,
};

type SpellCheckerContextValue = {
  settings: SpellCheckerSettings;
  isElectronSpell: boolean;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (partial: Partial<SpellCheckerSettings>) => Promise<void>;
};

const SpellCheckerContext = createContext<SpellCheckerContextValue | null>(null);

function normalizeSettings(raw: Partial<SpellCheckerSettings> | null | undefined): SpellCheckerSettings {
  if (!raw || typeof raw !== 'object') return { ...defaultSettings };
  return {
    spellcheckEnabled: raw.spellcheckEnabled !== false,
    spellcheckerLanguage:
      typeof raw.spellcheckerLanguage === 'string' && raw.spellcheckerLanguage.trim()
        ? raw.spellcheckerLanguage
        : 'en-US',
    autocorrectEnabled: !!raw.autocorrectEnabled,
  };
}

export function SpellCheckerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SpellCheckerSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isElectronSpell = !!(api && typeof api.spellGetSettings === 'function');

  const refreshSettings = useCallback(async () => {
    if (!api?.spellGetSettings) {
      setLoading(false);
      return;
    }
    try {
      const s = await api.spellGetSettings();
      setSettings(normalizeSettings(s));
    } catch {
      setSettings({ ...defaultSettings });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (!isElectronSpell || !settings.autocorrectEnabled) return;
    return installAutocorrect();
  }, [isElectronSpell, settings.autocorrectEnabled]);

  const updateSettings = useCallback(
    async (partial: Partial<SpellCheckerSettings>) => {
      if (!api?.spellSetSettings) return;
      const merged = await api.spellSetSettings(partial);
      setSettings(normalizeSettings(merged));
    },
    [api]
  );

  const value: SpellCheckerContextValue = {
    settings,
    isElectronSpell,
    loading,
    refreshSettings,
    updateSettings,
  };

  return <SpellCheckerContext.Provider value={value}>{children}</SpellCheckerContext.Provider>;
}

export function useSpellChecker(): SpellCheckerContextValue {
  const ctx = useContext(SpellCheckerContext);
  if (!ctx) {
    throw new Error('useSpellChecker must be used within SpellCheckerProvider');
  }
  return ctx;
}

export function useSpellCheckerOptional(): SpellCheckerContextValue | null {
  return useContext(SpellCheckerContext);
}
