import React from 'react';

/**
 * A wrapper around React.lazy that handles "Failed to fetch dynamically imported module" errors.
 * This error often happens when a new version of the app is deployed and the old chunks are removed.
 * It will attempt to reload the page once if the error occurs.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const component = await componentImport();
      
      // If we successfully loaded, clear the retry flag
      window.sessionStorage.removeItem('lazy-retry-done');
      
      return component;
    } catch (error: any) {
      console.error('Lazy loading error:', error);

      // Check if the error is a "Failed to fetch" or "module not found" error
      // which usually indicates a chunk loading failure after a new deployment
      const isChunkLoadFailed = 
        error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('error loading dynamically imported module') ||
        error.name === 'ChunkLoadError' ||
        /Loading chunk [\d]+ failed/.test(error.message);

      if (isChunkLoadFailed) {
        const hasRetried = window.sessionStorage.getItem('lazy-retry-done');
        
        if (!hasRetried) {
          console.warn('Chunk load failed. Retrying with page reload...');
          window.sessionStorage.setItem('lazy-retry-done', 'true');
          window.location.reload();
          
          // Return a promise that never resolves while the page reloads
          return new Promise<{ default: T }>(() => {});
        }
      }

      // If it's not a chunk load error or we've already retried, throw the error
      throw error;
    }
  });
}
