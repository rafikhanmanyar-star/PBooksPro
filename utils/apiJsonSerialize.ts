import { toLocalDateString } from './dateUtils';
import { isDateOnlyFieldName } from './dateOnlyKeys';

/**
 * Deep-clone plain JSON-ish data, converting Date instances for the wire.
 * Must run *before* JSON.stringify — V8 calls Date#toJSON before replacers see Date values.
 */
export function sanitizeDatesForApiJson(input: unknown, keyHint = ''): unknown {
  if (input instanceof Date) {
    return isDateOnlyFieldName(keyHint) ? toLocalDateString(input) : input.toISOString();
  }
  if (input !== null && typeof input === 'object') {
    if (Array.isArray(input)) {
      return input.map((item, i) => sanitizeDatesForApiJson(item, String(i)));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v instanceof Date) {
        out[k] = isDateOnlyFieldName(k) ? toLocalDateString(v) : v.toISOString();
      } else if (v !== null && typeof v === 'object') {
        out[k] = sanitizeDatesForApiJson(v, k);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return input;
}

/**
 * JSON body for API POST/PUT/PATCH: date-only fields → YYYY-MM-DD (local calendar);
 * real timestamps → ISO UTC.
 */
export function stringifyApiJsonBody(data: unknown): string {
  return JSON.stringify(sanitizeDatesForApiJson(data));
}
