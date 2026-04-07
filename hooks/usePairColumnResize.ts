import { useCallback, useRef, type Dispatch, type MouseEvent as ReactMouseEvent } from 'react';

/**
 * Drag the right edge of column `leftKey` to widen it and narrow `leftKey`'s right neighbor.
 * Total width of the pair stays constant (until a column hits its minimum).
 */
export function usePairColumnResize<K extends string>(
    setColWidths: Dispatch<SetStateAction<Record<K, number>>>,
    colMinWidths: Record<K, number>,
    colOrder: readonly K[]
) {
    const pairRef = useRef<{ left: K; right: K } | null>(null);

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!pairRef.current) return;
            const { left, right } = pairRef.current;
            const d = e.movementX;
            setColWidths(prev => {
                const minL = colMinWidths[left];
                const minR = colMinWidths[right];
                const lw = prev[left];
                const rw = prev[right];
                const sum = lw + rw;
                let nl = lw + d;
                nl = Math.max(minL, Math.min(nl, sum - minR));
                const nr = sum - nl;
                return { ...prev, [left]: nl, [right]: nr };
            });
        },
        [setColWidths, colMinWidths]
    );

    const endResize = useCallback(() => {
        pairRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', endResize);
        window.removeEventListener('blur', endResize);
        document.removeEventListener('visibilitychange', endResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [handleMouseMove]);

    const startResize = useCallback(
        (leftKey: K) => (e: ReactMouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = colOrder.indexOf(leftKey);
            const rightKey = colOrder[idx + 1];
            if (rightKey === undefined) return;
            pairRef.current = { left: leftKey, right: rightKey };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', endResize);
            window.addEventListener('blur', endResize);
            document.addEventListener('visibilitychange', endResize);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [colOrder, handleMouseMove, endResize]
    );

    return { startResize };
}
