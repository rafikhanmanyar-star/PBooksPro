import { sanitizeAmountInput } from './numberFormatting';

/**
 * Normalizes pasted or typed decimal amount strings for controlled inputs.
 * Strips thousand separators (commas), spaces, and non-numeric noise so pastes like
 * "1,512,000", "PKR 1512000", or "  1042000  " update the field correctly.
 */
export function normalizeDecimalAmountInput(raw: string): string {
    return sanitizeAmountInput(raw, { allowNegative: false, decimalPlaces: 2 });
}
