
import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook to preload page chunks on hover/idle for instant navigation
 * This reduces INP (Interaction to Next Paint) by loading chunks before user clicks
 * Optimized for better performance
 */
export function usePagePreloader() {
  const preloadedPages = useRef<Set<string>>(new Set());

  // Preload chunks when user hovers over navigation items
  const preloadPage = useCallback((pagePath: string) => {
    // Skip if already preloaded
    if (preloadedPages.current.has(pagePath)) {
      return;
    }

    // Use requestIdleCallback for non-blocking preload
    const preload = () => {
      import(pagePath)
        .then(() => {
          preloadedPages.current.add(pagePath);
        })
        .catch(() => {
          // Silently fail - page will load on demand
        });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(preload, { timeout: 2000 });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(preload, 100);
    }
  }, []);

  // Preload critical pages after initial load
  // DISABLED: Preloader was causing 404 errors due to path resolution issues
  // Components will load on-demand via React.lazy which works correctly
  // useEffect(() => {
  //   // Wait for initial render to complete
  //   const timer = setTimeout(() => {
  //     // Preload most commonly used pages
  //     // Use same paths as lazy imports in App.tsx (relative to src/)
  //     const criticalPages = [
  //       './components/dashboard/DashboardPage',
  //       './components/transactions/EnhancedLedgerPage',
  //       './components/settings/SettingsPage',
  //     ];

  //     criticalPages.forEach((page) => {
  //       preloadPage(page);
  //     });
  //   }, 2000); // Wait 2 seconds after initial load

  //   return () => clearTimeout(timer);
  // }, [preloadPage]);

  return { preloadPage };
}

