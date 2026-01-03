
/**
 * Formats a number with thousand-separator commas
 * @param value - The number or string to format
 * @param options - Formatting options
 * @returns Formatted number string with thousand separators
 */
export const formatNumber = (
  value: number | string | null | undefined,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showDecimals?: boolean;
  }
): string => {
  if (value === null || value === undefined || value === '') {
    return '0';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '0';
  }

  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    showDecimals = true
  } = options || {};

  const fractionDigits = showDecimals 
    ? { minimumFractionDigits, maximumFractionDigits }
    : { minimumFractionDigits: 0, maximumFractionDigits: 0 };

  return num.toLocaleString('en-US', {
    ...fractionDigits,
    useGrouping: true // This enables thousand separators
  });
};

/**
 * Formats a number for currency display (with 2 decimal places by default)
 * @param value - The number or string to format
 * @param showDecimals - Whether to show decimal places (default: true)
 * @returns Formatted number string with thousand separators
 */
export const formatCurrency = (
  value: number | string | null | undefined,
  showDecimals: boolean = true
): string => {
  return formatNumber(value, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
    showDecimals
  });
};

/**
 * Formats a number for display without decimals (rounded)
 * @param value - The number or string to format
 * @returns Formatted number string with thousand separators, no decimals
 */
export const formatRoundedNumber = (
  value: number | string | null | undefined
): string => {
  if (value === null || value === undefined || value === '') {
    return '0';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '0';
  }

  return Math.round(num).toLocaleString('en-US', {
    useGrouping: true
  });
};

