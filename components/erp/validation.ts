/**
 * Lightweight validation rules for ERP forms (real-time + submit).
 */

export type ValidationRule<T extends Record<string, unknown> = Record<string, unknown>> = {
  /** Field to attach error to (first failing rule wins per field if you group by field) */
  field: string;
  message: string;
  test: (values: T) => boolean;
};

export type FieldErrors = Record<string, string>;

export function runValidation<T extends Record<string, unknown>>(
  values: T,
  rules: ValidationRule<T>[]
): FieldErrors {
  const errors: FieldErrors = {};
  for (const r of rules) {
    if (!r.test(values)) {
      if (!errors[r.field]) errors[r.field] = r.message;
    }
  }
  return errors;
}

export function firstError(errors: FieldErrors): string | undefined {
  const k = Object.keys(errors)[0];
  return k ? errors[k] : undefined;
}

/** Common helpers */
export const Rules = {
  required<T extends Record<string, unknown>>(field: keyof T & string, message = 'Required'): ValidationRule<T> {
    return {
      field,
      message,
      test: (v) => v[field] !== undefined && v[field] !== null && String(v[field]).trim() !== '',
    };
  },
  minNumber<T extends Record<string, unknown>>(field: keyof T & string, min: number, message?: string): ValidationRule<T> {
    return {
      field,
      message: message ?? `Must be at least ${min}`,
      test: (v) => {
        const n = Number(v[field]);
        return Number.isFinite(n) && n >= min;
      },
    };
  },
  maxNumber<T extends Record<string, unknown>>(field: keyof T & string, max: number, message?: string): ValidationRule<T> {
    return {
      field,
      message: message ?? `Must be at most ${max}`,
      test: (v) => {
        const n = Number(v[field]);
        return Number.isFinite(n) && n <= max;
      },
    };
  },
  custom<T extends Record<string, unknown>>(
    field: string,
    message: string,
    test: (values: T) => boolean
  ): ValidationRule<T> {
    return { field, message, test };
  },
};
