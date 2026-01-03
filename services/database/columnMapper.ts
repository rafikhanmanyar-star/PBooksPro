/**
 * Column Mapper
 * 
 * Utilities for converting between database column names (snake_case)
 * and TypeScript property names (camelCase).
 */

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
            // Convert dates to ISO strings
            result[dbKey] = value.toISOString();
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
export function dbToObjectFormat<T extends Record<string, any>>(obj: Record<string, any>): T {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = snakeToCamel(key);
        // Convert integer (0/1) to boolean for fields that look like booleans
        if ((key.startsWith('is_') || key.startsWith('has_') || key.endsWith('_flag')) && 
            (value === 0 || value === 1)) {
            result[camelKey] = value === 1;
        } else if (key === 'expense_category_items' && typeof value === 'string' && value.trim().length > 0) {
            // Explicitly handle expense_category_items - always try to parse as JSON
            try {
                result[camelKey] = JSON.parse(value);
            } catch {
                // If parsing fails, keep the original string value
                result[camelKey] = value;
            }
        } else if (typeof value === 'string' && value.trim().length > 0) {
            // Try to parse JSON strings (objects or arrays)
            // Check if it looks like JSON (starts with { or [ and ends with } or ])
            const trimmed = value.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    result[camelKey] = JSON.parse(value);
                } catch {
                    // If parsing fails, keep the original string value
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
