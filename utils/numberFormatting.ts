/**
 * Centralized amount formatting and parsing for monetary inputs and display.
 * Uses Intl.NumberFormat (default locale en-US) for thousand separators.
 */

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_MAX_AMOUNT = 999_999_999_999_999.99;

export interface FormatAmountOptions {
  decimalPlaces?: number;
  locale?: string;
  useGrouping?: boolean;
}

export interface SanitizeAmountInputOptions {
  allowNegative?: boolean;
  decimalPlaces?: number;
  max?: number;
}

export interface ProcessAmountInputChangeResult {
  displayValue: string;
  rawValue: string;
  numericValue: number | null;
  cursorPosition: number;
}

const DEFAULT_DECIMAL_PLACES = 2;

function stripSeparators(value: string): string {
  return value.replace(/[\s\u00A0,]/g, '');
}

function clampToMax(value: number, max: number): number {
  if (value > max) return max;
  if (value < -max) return -max;
  return value;
}

/**
 * Parse a formatted or raw amount string into a number.
 * Returns null for empty, incomplete, or invalid input.
 */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  const trimmed = stripSeparators(String(raw).trim());
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/** Coerce API/SQLite amounts to a finite number for arithmetic (never string concat). */
export function coerceAmount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseAmount(String(value ?? ''));
  return parsed ?? 0;
}

/**
 * Format a numeric amount for display (not mid-typing).
 */
export function formatAmount(
  value: number | string | null | undefined,
  options?: FormatAmountOptions
): string {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const decimalPlaces = options?.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
  const useGrouping = options?.useGrouping ?? true;

  if (value === null || value === undefined || value === '') {
    return '';
  }

  const num = typeof value === 'string' ? parseAmount(value) : value;
  if (num == null || !Number.isFinite(num)) {
    return '';
  }

  return num.toLocaleString(locale, {
    useGrouping,
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  });
}

/**
 * Format amount with optional currency prefix (e.g. "PKR 1,500,000").
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options?: FormatAmountOptions & { currency?: string; showCurrency?: boolean }
): string {
  const formatted = formatAmount(value, options);
  if (!formatted) return '';
  if (options?.showCurrency && options.currency) {
    return `${options.currency} ${formatted}`;
  }
  return formatted;
}

/**
 * Sanitize typed/pasted input to allowed characters only.
 * Returns raw numeric string without thousand separators.
 */
export function sanitizeAmountInput(
  raw: string,
  options?: SanitizeAmountInputOptions
): string {
  const allowNegative = options?.allowNegative ?? false;
  const decimalPlaces = options?.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
  const max = options?.max ?? DEFAULT_MAX_AMOUNT;

  let value = stripSeparators(raw);
  if (value === '') return '';

  let sign = '';
  if (allowNegative && value.startsWith('-')) {
    sign = '-';
    value = value.slice(1);
  }

  value = value.replace(/[^\d.]/g, '');
  if (value === '') return sign === '-' ? '-' : '';

  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    const intPart = value.slice(0, firstDot);
    let fracPart = value.slice(firstDot + 1).replace(/\./g, '');
    if (decimalPlaces >= 0) {
      fracPart = fracPart.slice(0, decimalPlaces);
    }
    value = intPart + '.' + fracPart;
  }

  value = sign + value;

  const parsed = parseAmount(value);
  if (parsed != null) {
    const clamped = clampToMax(parsed, max);
    if (clamped !== parsed) {
      return formatRawFromNumber(clamped, decimalPlaces);
    }
  }

  return value;
}

function formatRawFromNumber(num: number, decimalPlaces: number): string {
  if (!Number.isFinite(num)) return '';
  if (Number.isInteger(num) || decimalPlaces === 0) {
    return String(num);
  }
  return num.toFixed(decimalPlaces).replace(/\.?0+$/, (match, offset, str) =>
    str.includes('.') && match.startsWith('.') ? '' : match
  );
}

/**
 * Format a raw numeric string for display while typing (with grouping).
 */
export function formatAmountForInput(
  raw: string,
  options?: FormatAmountOptions
): string {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const sanitized = stripSeparators(raw);
  if (sanitized === '') return '';
  if (sanitized === '-') return '-';

  const dotIndex = sanitized.indexOf('.');
  const intRaw = dotIndex === -1 ? sanitized : sanitized.slice(0, dotIndex);
  const fracRaw = dotIndex === -1 ? undefined : sanitized.slice(dotIndex + 1);

  const formattedInt = formatIntegerPartForInput(intRaw, locale);
  if (fracRaw === undefined) {
    return formattedInt;
  }
  if (sanitized.endsWith('.') && fracRaw === '') {
    return `${formattedInt}.`;
  }
  return `${formattedInt}.${fracRaw}`;
}

function formatIntegerPartForInput(intRaw: string, locale: string): string {
  if (intRaw === '' || intRaw === '-') return intRaw;

  const negative = intRaw.startsWith('-');
  const digits = negative ? intRaw.slice(1) : intRaw;
  if (digits === '') return negative ? '-' : '';

  // Preserve leading zero for "0.xxx" entry
  if (digits.length > 1 && digits.startsWith('0')) {
    return negative ? `-${digits}` : digits;
  }

  const num = Number(digits);
  if (!Number.isFinite(num)) {
    return intRaw;
  }

  const grouped = num.toLocaleString(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  });
  return negative ? `-${grouped}` : grouped;
}

/**
 * Count significant input characters (digits, decimal, leading minus) before cursor.
 */
export function countSignificantCharsBefore(value: string, cursorPos: number): number {
  let count = 0;
  const limit = Math.min(cursorPos, value.length);
  for (let i = 0; i < limit; i++) {
    const ch = value[i];
    if (ch >= '0' && ch <= '9') {
      count++;
    } else if (ch === '.') {
      count++;
    } else if (ch === '-' && count === 0) {
      count++;
    }
  }
  return count;
}

/**
 * Map significant-char count to cursor index in formatted display string.
 */
export function cursorFromSignificantCount(formatted: string, significantCount: number): number {
  if (significantCount <= 0) {
    return formatted.startsWith('-') ? 1 : 0;
  }

  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i];
    if (ch >= '0' && ch <= '9' || ch === '.' || (ch === '-' && seen === 0)) {
      seen++;
      if (seen >= significantCount) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

/**
 * Compute cursor position after reformatting display value.
 */
export function getCursorPositionAfterFormat(
  previousDisplay: string,
  previousCursor: number,
  newDisplay: string
): number {
  const significantBefore = countSignificantCharsBefore(previousDisplay, previousCursor);
  return cursorFromSignificantCount(newDisplay, significantBefore);
}

/**
 * Process a change event: sanitize, format for display, preserve cursor, return raw value.
 */
export function processAmountInputChange(
  inputValue: string,
  cursorPos: number,
  options?: SanitizeAmountInputOptions & FormatAmountOptions
): ProcessAmountInputChangeResult {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const significantBefore = countSignificantCharsBefore(inputValue, cursorPos);
  const rawValue = sanitizeAmountInput(inputValue, options);
  const displayValue = formatAmountForInput(rawValue, { locale, decimalPlaces: options?.decimalPlaces });
  const cursorPosition = cursorFromSignificantCount(displayValue, significantBefore);
  const numericValue = parseAmount(rawValue);

  return {
    displayValue,
    rawValue,
    numericValue,
    cursorPosition,
  };
}

/**
 * Convert external value prop (number or raw string) to raw string for internal use.
 */
export function valueToRawString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return stripSeparators(String(value));
}
