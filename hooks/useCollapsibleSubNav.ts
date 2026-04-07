import { useCallback, useEffect, useMemo, useState } from 'react';

function readCollapsed(storageKey: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    const v = JSON.parse(raw) as unknown;
    if (typeof v === 'boolean') return v;
    if (v === 'collapsed') return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Secondary module sidebar: manual expand/collapse only (persisted per module).
 */
export function useCollapsibleSubNav(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(collapsed));
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [collapsed, storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const toggleTitle = useMemo(
    () => (collapsed ? 'Expand module menu' : 'Collapse module menu'),
    [collapsed]
  );

  return {
    collapsed,
    setCollapsed,
    effectiveCollapsed: collapsed,
    toggle,
    toggleTitle,
  };
}
