import { CURRENCY } from '../../../constants';

const ABS_THRESHOLDS = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
] as const;

/**
 * Compact money: PKR 175.9M, PKR 25.2K (1 decimal when scaled).
 */
export function formatCompactMoney(value: number, currency: string = CURRENCY): string {
    const sign = value < 0 ? '-' : '';
    const n = Math.abs(value);
    if (!Number.isFinite(n) || n < 1) {
        return `${currency} ${sign}${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
    }
    for (const { v, s } of ABS_THRESHOLDS) {
        if (n >= v) {
            const scaled = n / v;
            const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 1;
            return `${currency} ${sign}${scaled.toFixed(digits)}${s}`;
        }
    }
    return `${currency} ${sign}${n.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

export function formatFullMoney(value: number, currency: string = CURRENCY): string {
    return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRoi(roiPct: number | null | undefined): string {
    if (roiPct == null || !Number.isFinite(roiPct)) return '—';
    return `${roiPct.toFixed(1)}%`;
}
