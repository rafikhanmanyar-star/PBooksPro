/**
 * Viewport detection — single source of truth for responsive layout.
 * Aligns with Tailwind `md` breakpoint (768px) and executive mobile criteria.
 */

/** Max width (px) treated as mobile — matches Tailwind `md:` (min-width 768px). */
export const MOBILE_MAX_WIDTH = 767;

/** Max width (px) for tablet band (portrait tablets). */
export const TABLET_MAX_WIDTH = 1023;

export type ViewportBreakpoint = 'mobile' | 'tablet' | 'desktop';

export type ViewportProfile = {
  width: number;
  height: number;
  breakpoint: ViewportBreakpoint;
  /** `width <= MOBILE_MAX_WIDTH` — use for layout (matches `md:hidden` / `max-md:`). */
  isMobileViewport: boolean;
  /** Tablet width in portrait orientation. */
  isTabletPortrait: boolean;
  /** Cloud executive shell criteria (mobile viewport or tablet portrait). */
  isExecutiveViewport: boolean;
  isTouchDevice: boolean;
  hasMobileUserAgent: boolean;
};

const MOBILE_UA_RE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { electronAPI?: unknown }).electronAPI;
}

export function hasMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return MOBILE_UA_RE.test(ua);
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/** Prefer visualViewport when available (mobile browser chrome). */
export function getViewportDimensions(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 };
  }
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

export function resolveBreakpoint(width: number): ViewportBreakpoint {
  if (width <= MOBILE_MAX_WIDTH) return 'mobile';
  if (width <= TABLET_MAX_WIDTH) return 'tablet';
  return 'desktop';
}

/**
 * Full viewport profile for layout decisions.
 * @param options.electronIsDesktop — when true (Electron), never treat as mobile viewport.
 */
export function getViewportProfile(options?: { electronIsDesktop?: boolean }): ViewportProfile {
  const electronIsDesktop = options?.electronIsDesktop ?? isElectronRuntime();
  const { width, height } = getViewportDimensions();

  if (electronIsDesktop) {
    return {
      width,
      height,
      breakpoint: resolveBreakpoint(width),
      isMobileViewport: false,
      isTabletPortrait: false,
      isExecutiveViewport: false,
      isTouchDevice: isTouchDevice(),
      hasMobileUserAgent: hasMobileUserAgent(),
    };
  }

  const uaMobile = hasMobileUserAgent();
  const touch = isTouchDevice();
  const isMobileViewport = width <= MOBILE_MAX_WIDTH;
  const isTabletPortrait =
    width > MOBILE_MAX_WIDTH && width <= TABLET_MAX_WIDTH && height > width;
  const isExecutiveViewport = isMobileViewport || isTabletPortrait;

  return {
    width,
    height,
    breakpoint: resolveBreakpoint(width),
    isMobileViewport,
    isTabletPortrait,
    isExecutiveViewport,
    isTouchDevice: touch,
    hasMobileUserAgent: uaMobile,
  };
}

/** Apply `data-viewport` + CSS variables for global responsive styling. */
export function applyViewportProfileToDocument(profile: ViewportProfile): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.viewport = profile.breakpoint;
  root.dataset.mobileViewport = profile.isMobileViewport ? 'true' : 'false';
  root.dataset.executiveViewport = profile.isExecutiveViewport ? 'true' : 'false';
  root.style.setProperty('--viewport-inner-width', `${profile.width}px`);
  root.style.setProperty('--viewport-inner-height', `${profile.height}px`);
  root.style.setProperty('--viewport-mobile', profile.isMobileViewport ? '1' : '0');
  root.style.setProperty('--viewport-executive', profile.isExecutiveViewport ? '1' : '0');
}

export type ViewportChangeCallback = (profile: ViewportProfile) => void;

/**
 * Subscribe to viewport changes (resize, orientation, visualViewport, matchMedia).
 * Returns unsubscribe function.
 */
export function subscribeViewportChanges(
  callback: ViewportChangeCallback,
  options?: { electronIsDesktop?: boolean }
): () => void {
  if (typeof window === 'undefined') return () => {};

  let rafId = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const emit = () => {
    callback(getViewportProfile(options));
  };

  const scheduleEmit = () => {
    cancelAnimationFrame(rafId);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    rafId = requestAnimationFrame(() => {
      emit();
      // iOS Safari: dimensions may update after orientationchange
      timeoutId = setTimeout(emit, 120);
    });
  };

  const mobileMq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
  const tabletMq = window.matchMedia(
    `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`
  );

  const onMqChange = () => scheduleEmit();

  window.addEventListener('resize', scheduleEmit, { passive: true });
  window.addEventListener('orientationchange', scheduleEmit, { passive: true });
  mobileMq.addEventListener('change', onMqChange);
  tabletMq.addEventListener('change', onMqChange);

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', scheduleEmit, { passive: true });
    vv.addEventListener('scroll', scheduleEmit, { passive: true });
  }

  emit();

  return () => {
    cancelAnimationFrame(rafId);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    window.removeEventListener('resize', scheduleEmit);
    window.removeEventListener('orientationchange', scheduleEmit);
    mobileMq.removeEventListener('change', onMqChange);
    tabletMq.removeEventListener('change', onMqChange);
    if (vv) {
      vv.removeEventListener('resize', scheduleEmit);
      vv.removeEventListener('scroll', scheduleEmit);
    }
  };
}
