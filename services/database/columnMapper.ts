/**
 * Column Mapper
 * 
 * Utilities for converting between database column names (snake_case)
 * and TypeScript property names (camelCase).
 */

import { toLocalDateString } from '../../utils/dateUtils';
import { isDateOnlyFieldName } from '../../utils/dateOnlyKeys';

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert object keys from camelCase to snake_case
 * Also converts boolean values to integers (0/1) for SQLite
 */
export function objectToDbFormat<T extends Record<string, any>>(obj: T): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        const dbKey = camelToSnake(key);
        // Convert boolean to integer for SQLite
        if (typeof value === 'boolean') {
            result[dbKey] = value ? 1 : 0;
        } else if (value === null || value === undefined) {
            // Skip null/undefined values
            continue;
        } else if (Array.isArray(value)) {
            // Convert arrays to JSON strings
            result[dbKey] = JSON.stringify(value);
        } else if (typeof value === 'object' && !(value instanceof Date)) {
            // Convert nested objects to JSON strings
            result[dbKey] = JSON.stringify(value);
        } else if (value instanceof Date) {
            // Calendar date fields: local YYYY-MM-DD (never UTC via toISOString — avoids −1 day in UTC+ zones)
            result[dbKey] = isDateOnlyFieldName(key) ? toLocalDateString(value) : value.toISOString();
        } else {
            result[dbKey] = value;
        }
    }
    return result;
}

/**
 * Convert object keys from snake_case to camelCase
 * Also converts integer values (0/1) back to booleans for fields that look like booleans
 */
const NUMERIC_COLUMNS = new Set([
    'amount', 'paid_amount', 'opening_balance', 'balance', 'monthly_rent', 'rent_due_date', 'security_deposit',
    'ownership_percentage',
    'broker_fee', 'sale_price', 'area', 'monthly_service_charge', 'price',
    'list_price', 'customer_discount', 'floor_discount', 'lump_sum_discount',
    'misc_discount', 'selling_price', 'down_payment_percentage', 'down_payment_amount',
    'installment_amount', 'total_installments', 'duration_years',
    'amenities_total', 'rebate_amount', 'pm_cost_percentage',
]);

export function dbToObjectFormat<T extends Record<string, any>>(obj: Record<string, any>): T {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = snakeToCamel(key);
        if ((key.startsWith('is_') || key.startsWith('has_') || key.endsWith('_flag')) && 
            (value === 0 || value === 1)) {
            result[camelKey] = value === 1;
        } else if (NUMERIC_COLUMNS.has(key) && value != null) {
            result[camelKey] = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        } else if (NUMERIC_COLUMNS.has(key)) {
            // Ensure numeric columns always have a number (null/undefined → 0) so reports and grids never see missing values
            result[camelKey] = 0;
        } else if (key === 'expense_category_items' && typeof value === 'string' && value.trim().length > 0) {
            try {
                result[camelKey] = JSON.parse(value);
            } catch {
                result[camelKey] = value;
            }
        } else if (key === 'auto_renew_lease' && (value === 0 || value === 1)) {
            result[camelKey] = value === 1;
        } else if (typeof value === 'string' && value.trim().length > 0) {
            const trimmed = value.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    result[camelKey] = JSON.parse(value);
                } catch {
                    result[camelKey] = value;
                }
            } else {
                result[camelKey] = value;
            }
        } else {
            result[camelKey] = value;
        }
    }
    return result as T;
}

/**
 * Note: The current implementation uses direct property mapping.
 * For full compatibility, repositories should use these conversion functions.
 * This is a known limitation that can be addressed in future updates.
 */
