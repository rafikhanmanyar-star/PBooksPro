import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import useLocalStorage from '../hooks/useLocalStorage';

export type ViewportSize = {
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
  isCompactDesktop: boolean;
};

const DEFAULT_VIEWPORT: ViewportSize = {
  screenWidth: typeof window !== 'undefined' ? window.screen?.width ?? 1920 : 1920,
  screenHeight: typeof window !== 'undefined' ? window.screen?.height ?? 1080 : 1080,
  innerWidth: typeof window !== 'undefined' ? window.innerWidth : 1920,
  innerHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
  isCompactDesktop: false,
};

const COMPACT_MAX_WIDTH = 1400;
const COMPACT_MAX_HEIGHT = 800;

function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return DEFAULT_VIEWPORT;
  const screenWidth = window.screen?.width ?? window.innerWidth;
  const screenHeight = window.screen?.height ?? window.innerHeight;
  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;
  const isCompactDesktop =
    screenWidth <= COMPACT_MAX_WIDTH || screenHeight <= COMPACT_MAX_HEIGHT;
  return {
    screenWidth,
    screenHeight,
    innerWidth,
    innerHeight,
    isCompactDesktop,
  };
}

function applyViewportCSS(size: ViewportSize) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--viewport-screen-width', String(size.screenWidth));
  root.style.setProperty('--viewport-screen-height', String(size.screenHeight));
  root.style.setProperty('--viewport-compact', size.isCompactDesktop ? '1' : '0');
  root.style.setProperty(
    '--content-padding',
    size.isCompactDesktop ? '0.5rem' : '1rem'
  );
  root.style.setProperty(
    '--content-padding-lg',
    size.isCompactDesktop ? '0.75rem' : '1.5rem'
  );
  root.dataset.viewportCompact = size.isCompactDesktop ? 'true' : 'false';
}

const SIDEBAR_RAIL_WIDTH = '4rem';

function applySidebarWidth(size: ViewportSize, mainNavCollapsed: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mainNavCollapsed) {
    root.style.setProperty('--sidebar-width', SIDEBAR_RAIL_WIDTH);
  } else {
    root.style.setProperty('--sidebar-width', size.isCompactDesktop ? '14rem' : '16rem');
  }
  root.dataset.mainNavCollapsed = mainNavCollapsed ? 'true' : 'false';
}

export type ViewportLayoutState = ViewportSize & {
  mainNavCollapsed: boolean;
  setMainNavCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleMainNav: () => void;
  /** Alias for mainNavCollapsed */
  mainNavEffectiveCollapsed: boolean;
};

const ViewportContext = createContext<ViewportLayoutState | null>(null);

/** One-time: old three-state key → boolean collapsed */
function migrateLegacyMainNavMode(
  setMainNavCollapsed: React.Dispatch<React.SetStateAction<boolean>>
): void {
  try {
    const legacy = localStorage.getItem('app_main_nav_mode');
    if (legacy === null) return;
    const m = JSON.parse(legacy) as string;
    setMainNavCollapsed(m === 'collapsed');
    localStorage.removeItem('app_main_nav_mode');
  } catch {
    /* ignore */
  }
}

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const [size, setSize] = useState<ViewportSize>(() => getViewportSize());
  const [mainNavCollapsed, setMainNavCollapsed] = useLocalStorage<boolean>('app_main_nav_collapsed', false);

  useLayoutEffect(() => {
    migrateLegacyMainNavMode(setMainNavCollapsed);
  }, [setMainNavCollapsed]);

  const toggleMainNav = useCallback(() => {
    setMainNavCollapsed((v) => !v);
  }, [setMainNavCollapsed]);

  const update = useCallback(() => {
    const next = getViewportSize();
    setSize((prev) =>
      prev.screenWidth === next.screenWidth &&
        prev.screenHeight === next.screenHeight &&
        prev.innerWidth === next.innerWidth &&
        prev.innerHeight === next.innerHeight &&
        prev.isCompactDesktop === next.isCompactDesktop
        ? prev
        : next
    );
  }, []);

  useLayoutEffect(() => {
    applyViewportCSS(size);
    applySidebarWidth(size, mainNavCollapsed);
  }, [size, mainNavCollapsed]);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const value = useMemo<ViewportLayoutState>(
    () => ({
      ...size,
      mainNavCollapsed,
      setMainNavCollapsed,
      toggleMainNav,
      mainNavEffectiveCollapsed: mainNavCollapsed,
    }),
    [size, mainNavCollapsed, setMainNavCollapsed, toggleMainNav]
  );

  return (
    <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>
  );
}

export function useViewport(): ViewportLayoutState {
  const ctx = useContext(ViewportContext);
  if (!ctx) {
    throw new Error('useViewport must be used within ViewportProvider');
  }
  return ctx;
}
