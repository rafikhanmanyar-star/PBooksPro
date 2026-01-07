import { useState, useEffect, useCallback, useRef } from 'react';

interface ViewportSize {
  width: number;
  height: number;
}

interface ViewportBreakpoints {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
}

interface UseViewportReturn extends ViewportSize, ViewportBreakpoints {
  isSmallerThan: (width: number) => boolean;
  isLargerThan: (width: number) => boolean;
}

// Debounce utility
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export const useViewport = (debounceMs: number = 150): UseViewportReturn => {
  // SSR-safe initial state
  const [viewport, setViewport] = useState<ViewportSize>(() => {
    if (typeof window !== 'undefined') {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    return { width: 1920, height: 1080 }; // Default desktop size for SSR
  });

  // Calculate breakpoints
  const breakpoints: ViewportBreakpoints = {
    isMobile: viewport.width < 640, // sm breakpoint
    isTablet: viewport.width >= 640 && viewport.width < 1024, // sm to lg
    isDesktop: viewport.width >= 1024 && viewport.width < 1536, // lg to 2xl
    isLargeDesktop: viewport.width >= 1536, // 2xl+
  };

  // Update viewport size - use ref to avoid dependency issues
  const updateViewportRef = useRef(() => {
    if (typeof window !== 'undefined') {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
  });

  // Keep ref updated
  updateViewportRef.current = () => {
    if (typeof window !== 'undefined') {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
  };

  // Store debounced function in ref
  const debouncedUpdateRef = useRef<ReturnType<typeof debounce>>();
  
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create debounced function
    debouncedUpdateRef.current = debounce(() => {
      updateViewportRef.current();
    }, debounceMs);

    // Initial update
    updateViewportRef.current();

    const debouncedUpdate = debouncedUpdateRef.current;

    // Add resize listener
    window.addEventListener('resize', debouncedUpdate);
    window.addEventListener('orientationchange', updateViewportRef.current);

    // Cleanup
    return () => {
      window.removeEventListener('resize', debouncedUpdate);
      window.removeEventListener('orientationchange', updateViewportRef.current);
    };
  }, [debounceMs]);

  // Helper functions
  const isSmallerThan = useCallback(
    (width: number) => viewport.width < width,
    [viewport.width]
  );

  const isLargerThan = useCallback(
    (width: number) => viewport.width > width,
    [viewport.width]
  );

  return {
    ...viewport,
    ...breakpoints,
    isSmallerThan,
    isLargerThan,
  };
};

