/**
 * Task Scheduler Utilities
 * 
 * Utilities for breaking up long-running tasks to improve INP.
 * Uses scheduler.yield() when available, falls back to setTimeout.
 */

/**
 * Yields control to the browser to allow other tasks to run.
 * This prevents blocking the main thread during long operations.
 */
export function yieldToMain(): Promise<void> {
  // Use scheduler.yield() if available (Chrome 94+)
  if ('scheduler' in window && 'yield' in (window as any).scheduler) {
    return (window as any).scheduler.yield();
  }
  // Fallback to setTimeout(0) for older browsers
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Processes items in chunks, yielding between chunks to keep UI responsive.
 * Useful for processing large arrays without blocking.
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T) => R,
  chunkSize: number = 50
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = chunk.map(processor);
    results.push(...chunkResults);
    
    // Yield to main thread after each chunk
    if (i + chunkSize < items.length) {
      await yieldToMain();
    }
  }
  
  return results;
}

/**
 * Wraps a function to run in chunks, yielding between chunks.
 */
export function chunked<T extends (...args: any[]) => any>(
  fn: T,
  chunkSize: number = 50
): T {
  return ((...args: Parameters<T>) => {
    const result = fn(...args);
    
    if (Array.isArray(result)) {
      return processInChunks(result, x => x, chunkSize);
    }
    
    return result;
  }) as T;
}

