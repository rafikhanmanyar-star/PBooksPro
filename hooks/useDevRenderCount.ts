import { useRef, useEffect } from 'react';

/**
 * Logs render counts in development only (Chrome DevTools console).
 * Use on heavy pages (ledger, contacts) while profiling; remove or stop calling once done.
 */
export function useDevRenderCount(componentName: string): void {
    const countRef = useRef(0);
    countRef.current += 1;
    // Intentionally no dependency array: log after commits when render count hits milestones.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const n = countRef.current;
        if (n === 1 || n % 25 === 0) {
            console.debug(`[perf:render] ${componentName} × ${n}`);
        }
    }); // eslint-disable-line react-hooks/exhaustive-deps
}
