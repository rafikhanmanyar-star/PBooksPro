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
export const roundToTwo = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Format currency amount with proper rounding and locale formatting
 * @param amount - Amount to format
 * @param includeSymbol - Whether to include "PKR" symbol (default: false)
 * @returns Formatted amount string
 */
export const formatCurrency = (amount: number | null | undefined, includeSymbol: boolean = false): string => {
  if (amount === null || amount === undefined) return '—';
  
  // Round to 2 decimal places
  const rounded = roundToTwo(amount);
  
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
export const calculateAmount = (basic: number, amount: number, isPercentage: boolean): number => {
  const calculated = isPercentage ? (basic * amount) / 100 : amount;
  return roundToTwo(calculated);
};
