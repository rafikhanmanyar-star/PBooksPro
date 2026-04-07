/**
 * Normalizes pasted or typed decimal amount strings for controlled inputs.
 * Strips thousand separators (commas), spaces, and non-numeric noise so pastes like
 * "1,512,000", "PKR 1512000", or "  1042000  " update the field correctly.
 */
export function normalizeDecimalAmountInput(raw: string): string {
    if (raw === '') return '';
    const noSeparators = raw.replace(/[\s\u00A0,]/g, '');
    if (/^\d*\.?\d*$/.test(noSeparators)) return noSeparators;
    let s = noSeparators.replace(/[^\d.]/g, '');
    if (!s) return '';
    const firstDot = s.indexOf('.');
    if (firstDot === -1) return s;
    return s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
}
