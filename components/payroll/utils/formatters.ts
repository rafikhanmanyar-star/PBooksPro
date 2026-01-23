/**
 * Utility functions for formatting payroll data
 */

/**
 * Format date to display only the date part (no time)
 * @param dateString - ISO date string or date object
 * @returns Formatted date string (YYYY-MM-DD)
 */
export const formatDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '—';
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    
    // Check if valid date
    if (isNaN(date.getTime())) return '—';
    
    // Return in YYYY-MM-DD format
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.warn('Error formatting date:', error);
    return '—';
  }
};

/**
 * Format date for display (e.g., "Jan 23, 2026")
 * @param dateString - ISO date string or date object
 * @returns Formatted date string
 */
export const formatDateLong = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '—';
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    
    // Check if valid date
    if (isNaN(date.getTime())) return '—';
    
    // Return in long format
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (error) {
    console.warn('Error formatting date:', error);
    return '—';
  }
};

/**
 * Round a number to 2 decimal places
 * @param value - Number to round
 * @returns Rounded number
 */
export const roundToTwo = (value: number | string | null | undefined): number => {
  // Handle null/undefined
  if (value === null || value === undefined) return 0;
  
  // Convert to number if it's a string (handles database DECIMAL types)
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if it's a valid number
  if (isNaN(numericValue)) return 0;
  
  return Math.round((numericValue + Number.EPSILON) * 100) / 100;
};

/**
 * Format currency amount with proper rounding and locale formatting
 * @param amount - Amount to format
 * @param includeSymbol - Whether to include "PKR" symbol (default: false)
 * @returns Formatted amount string
 */
export const formatCurrency = (amount: number | string | null | undefined, includeSymbol: boolean = false): string => {
  if (amount === null || amount === undefined) return '—';
  
  // Convert to number if it's a string (handles database DECIMAL types)
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Check if it's a valid number
  if (isNaN(numericAmount)) return '—';
  
  // Round to 2 decimal places
  const rounded = roundToTwo(numericAmount);
  
  // Format with commas and 2 decimal places
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return includeSymbol ? `PKR ${formatted}` : formatted;
};

/**
 * Format currency for display (without decimal places if whole number)
 * @param amount - Amount to format
 * @returns Formatted amount string
 */
export const formatCurrencyCompact = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  
  // Round to 2 decimal places
  const rounded = roundToTwo(amount);
  
  // Format with commas
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Calculate allowance/deduction amount with proper rounding
 * @param basic - Basic salary or base amount
 * @param amount - Amount or percentage
 * @param isPercentage - Whether amount is a percentage
 * @returns Calculated and rounded amount
 */
export const calculateAmount = (
  basic: number | string, 
  amount: number | string, 
  isPercentage: boolean
): number => {
  // Convert to numbers if strings (handles database DECIMAL types)
  const numericBasic = typeof basic === 'string' ? parseFloat(basic) : basic;
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Check for valid numbers
  if (isNaN(numericBasic) || isNaN(numericAmount)) return 0;
  
  const calculated = isPercentage ? (numericBasic * numericAmount) / 100 : numericAmount;
  return roundToTwo(calculated);
};
