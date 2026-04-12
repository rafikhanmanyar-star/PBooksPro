/** YYYY-MM-DD from local date parts (avoids timezone shift from toISOString). */
export const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Legacy key before per-user scoping (migrated on first read when user id is set). */
const DISPLAY_TIMEZONE_LEGACY_KEY = 'pbooks_display_timezone';

let displayTimeZoneUserId: string | null = null;

/**
 * Set the signed-in user id so display timezone preference is stored per user (local cache).
 * Call on login with the real user id; call with `null` on logout.
 */
export function setDisplayTimeZoneUserContext(userId: string | null): void {
  displayTimeZoneUserId = userId;
}

function displayTimeZoneStorageKey(): string {
  return displayTimeZoneUserId ? `pbooks_display_timezone_u_${displayTimeZoneUserId}` : DISPLAY_TIMEZONE_LEGACY_KEY;
}

/** IANA time zone for calendar display, or null = use device (browser) local time. */
export function getDisplayTimeZone(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const key = displayTimeZoneStorageKey();
    let v = localStorage.getItem(key);
    if ((v == null || v === '') && displayTimeZoneUserId) {
      const legacy = localStorage.getItem(DISPLAY_TIMEZONE_LEGACY_KEY);
      if (legacy != null && legacy !== '') {
        localStorage.setItem(key, legacy);
        v = legacy;
      }
    }
    if (v == null || v === '' || v === 'auto') return null;
    return v;
  } catch {
    return null;
  }
}

/** Apply timezone from server profile (PostgreSQL / SQLite user row). `null` = device local. */
export function applyDisplayTimezoneFromProfile(displayTimezone: string | null | undefined): void {
  if (displayTimezone === undefined) return;
  setDisplayTimeZone(displayTimezone);
}

/** Persist display time zone and notify listeners so lists refresh. */
export function setDisplayTimeZone(zone: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = displayTimeZoneStorageKey();
    if (zone == null || zone === 'auto') localStorage.removeItem(key);
    else localStorage.setItem(key, zone);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pbooks-display-timezone-change'));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Calendar YYYY-MM-DD for an instant using the app display time zone (Settings), or browser local if unset.
 * Use this instead of taking the UTC prefix from ISO strings like `...T...Z` (which caused one-day errors in UTC+ regions).
 */
export function toYyyyMmDdInDisplayZone(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return toLocalDateString(new Date());
  const zone = getDisplayTimeZone();
  if (!zone) return toLocalDateString(d);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (!y || !m || !day) return toLocalDateString(d);
    return `${y}-${m}-${day}`;
  } catch {
    return toLocalDateString(d);
  }
}

/**
 * Local calendar "today" as YYYY-MM-DD (respects optional display time zone in Settings).
 * Prefer this over `new Date().toISOString().slice(0, 10)` in all UI code (avoids off-by-one in non-UTC zones).
 */
export function todayLocalYyyyMmDd(): string {
  return toYyyyMmDdInDisplayZone(new Date());
}

/** Current calendar month as `YYYY-MM` (respects optional display time zone). */
export function currentMonthYyyyMm(anchor: Date = new Date()): string {
  return toYyyyMmDdInDisplayZone(anchor).slice(0, 7);
}

/**
 * ISO datetime at UTC midnight (PostgreSQL DATE / JSON), e.g. `2026-04-07T00:00:00.000Z` — calendar day is the UTC date, not the local evening of the previous day in Americas timezones.
 */
export function tryParseSqlUtcMidnightIsoToYyyyMmDd(s: string): string | null {
  const t = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(t)) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Serialize a `Date` from a calendar control (`DatePicker` `onChange`) to YYYY-MM-DD for storage/API.
 * Uses the app display time zone (Settings) when set, else browser local — matches "App timezone" in settings.
 */
export function fromPickerDateToYyyyMmDd(d: Date): string {
  return toYyyyMmDdInDisplayZone(d);
}

/** First / last calendar day of the month for `anchor`, as YYYY-MM-DD (local). */
export function startOfMonthYyyyMmDd(anchor: Date = new Date()): string {
  return toLocalDateString(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
}

export function endOfMonthYyyyMmDd(anchor: Date = new Date()): string {
  return toLocalDateString(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
}

/**
 * True when `value` is exactly `YYYY-MM-DD` and matches a real calendar date
 * (rejects `2026-02-30`, malformed text, etc.).
 */
export function isValidYyyyMmDdDate(value: string | undefined | null): boolean {
  if (value == null) return false;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const d = new Date(y, mo - 1, day);
  return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
}

/** First day of month from `YYYY-MM` (e.g. `<input type="month">`). Returns null if invalid. */
export function firstDayOfMonthFromYyyyMm(monthYyyyMm: string | undefined | null): string | null {
  if (monthYyyyMm == null) return null;
  const s = String(monthYyyyMm).trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const day = `${s}-01`;
  return isValidYyyyMmDdDate(day) ? day : null;
}

/**
 * Normalize a stored date (YYYY-MM-DD or ISO) for `<input type="date">` / DatePicker `value`.
 * Pure `YYYY-MM-DD` is kept as-is.
 * PostgreSQL/API `...T00:00:00.000Z` uses **UTC calendar day** (matches SQL DATE).
 * Other ISO strings use the calendar day in the display time zone (Settings) or browser local.
 */
export function parseStoredDateToYyyyMmDdInput(value: string | undefined | null): string {
  if (!value) return toYyyyMmDdInDisplayZone(new Date());
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (isValidYyyyMmDdDate(s)) return s;
    return toYyyyMmDdInDisplayZone(new Date());
  }
  const utcCivil = tryParseSqlUtcMidnightIsoToYyyyMmDd(s);
  if (utcCivil) return utcCivil;
  const d = new Date(s);
  if (isNaN(d.getTime())) return toYyyyMmDdInDisplayZone(new Date());
  return toYyyyMmDdInDisplayZone(d);
}

/**
 * Normalize any value to YYYY-MM-DD for date-only storage and APIs (local calendar for Date values).
 * Prefer over `dayjs(d).format('YYYY-MM-DD')` when d may already be a string.
 */
export function toDateOnly(input: Date | string | number | null | undefined): string {
  if (input == null || input === '') return todayLocalYyyyMmDd();
  if (input instanceof Date) return toYyyyMmDdInDisplayZone(input);
  if (typeof input === 'number' && Number.isFinite(input)) return toYyyyMmDdInDisplayZone(new Date(input));
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return parseStoredDateToYyyyMmDdInput(s);
}

/**
 * Parse pasted or typed dates into YYYY-MM-DD (local calendar day).
 * Accepts YYYY-MM-DD, DD/MM/YYYY (and - or . separators), YYYY/MM/DD, and strings parseable by Date.
 */
export function parseFlexibleDateToYyyyMmDd(value: string | undefined | null): string {
  if (value == null || value === '') return toLocalDateString(new Date());
  const trimmed = String(value).trim();
  if (!trimmed) return toLocalDateString(new Date());

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [ys, ms, ds] = trimmed.split('-');
    const y = parseInt(ys, 10);
    const m = parseInt(ms, 10);
    const day = parseInt(ds, 10);
    const d = new Date(y, m - 1, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day) {
      return trimmed;
    }
  }

  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return toLocalDateString(d);
    }
  }

  const ymd = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10);
    const day = parseInt(ymd[3], 10);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return toLocalDateString(d);
    }
  }

  const withTime = trimmed.includes('T') ? trimmed : `${trimmed}T12:00:00`;
  const parsed = new Date(withTime);
  if (!isNaN(parsed.getTime())) return toLocalDateString(parsed);

  return toLocalDateString(new Date());
}

/** Same as {@link parseFlexibleDateToYyyyMmDd} but returns `null` if the string cannot be interpreted as a calendar date. */
export function tryParseFlexibleDateToYyyyMmDd(value: string | undefined | null): string | null {
  if (value == null || value === '') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [ys, ms, ds] = trimmed.split('-');
    const y = parseInt(ys, 10);
    const m = parseInt(ms, 10);
    const day = parseInt(ds, 10);
    const d = new Date(y, m - 1, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day) {
      return trimmed;
    }
    return null;
  }

  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return toLocalDateString(d);
    }
    return null;
  }

  const ymd = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10);
    const day = parseInt(ymd[3], 10);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return toLocalDateString(d);
    }
    return null;
  }

  const withTime = trimmed.includes('T') ? trimmed : `${trimmed}T12:00:00`;
  const parsed = new Date(withTime);
  if (!isNaN(parsed.getTime())) return toLocalDateString(parsed);

  return null;
}

/**
 * Parse YYYY-MM-DD as a local calendar date (no UTC midnight shift from `new Date('YYYY-MM-DD')`).
 * Required for recurring invoice math in all timezones.
 */
export function parseYyyyMmDdToLocalDate(dateStr: string): Date {
  const s = String(dateStr ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const d = new Date(y, mo - 1, day);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** 1st of the next month from the given date, as YYYY-MM-DD in local time. Use for recurring invoice nextDueDate. */
export const getFirstOfNextMonthLocal = (fromDate: Date): string => {
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth();
  const nextM = m + 1;
  const nextY = nextM > 11 ? y + 1 : y;
  const normM = nextM > 11 ? 0 : nextM;
  return `${nextY}-${String(normM + 1).padStart(2, '0')}-01`;
};

/** Given day (1–31) in the next month from fromDate, as YYYY-MM-DD in local time. Clamps to last day of month. */
export const getDayOfNextMonthLocal = (fromDate: Date, dayOfMonth: number): string => {
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth();
  const nextM = m + 1;
  const nextY = nextM > 11 ? y + 1 : y;
  const normM = nextM > 11 ? 0 : nextM;
  const lastDay = new Date(nextY, normM + 1, 0).getDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${nextY}-${String(normM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Next recurring schedule date after invoicing on `fromYyyyMmDd` (same rule as "Monthly on Nth"):
 * the Nth day of the **next** calendar month (clamped to month length).
 */
export function getNextRecurringDueDate(fromYyyyMmDd: string, dayOfMonth: number): string {
  const from = parseYyyyMmDdToLocalDate(fromYyyyMmDd);
  if (isNaN(from.getTime())) return String(fromYyyyMmDd).slice(0, 10);
  return getDayOfNextMonthLocal(from, dayOfMonth);
}

/**
 * If "Monthly on 1st" but stored date is the last day of that month (legacy UTC bug),
 * show/save as 1st of the next month instead.
 */
export function fixRecurringNextDueWhenDayOneIsLastDayOfMonth(
  dateStr: string,
  dayOfMonth: number
): string {
  if (dayOfMonth !== 1) return dateStr;
  const d = parseYyyyMmDdToLocalDate(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
  if (day === lastDayOfMonth) return getFirstOfNextMonthLocal(d);
  return dateStr;
}

/** Display calendar dates as DD-MM-YYYY (storage remains YYYY-MM-DD). */
export const formatDate = (date: string | Date | undefined | null): string => {
  if (!date) return '';

  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (!trimmed) return '';
    // Date-only storage: no time component — show that calendar day as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-');
      return `${d}-${m}-${y}`;
    }
    // SQL DATE serialized as UTC midnight — use UTC calendar (fixes −1 day in UTC− timezones)
    const utcCivil = tryParseSqlUtcMidnightIsoToYyyyMmDd(trimmed);
    if (utcCivil) {
      const [y, mo, day] = utcCivil.split('-');
      return `${day}-${mo}-${y}`;
    }
    // Other ISO / timestamps: calendar day in display zone
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const ymd = toYyyyMmDdInDisplayZone(parsed);
      const [y, mo, day] = ymd.split('-');
      return `${day}-${mo}-${y}`;
    }
    return '';
  }

  const d = new Date(date as Date);
  if (isNaN(d.getTime())) return '';
  const ymd = toYyyyMmDdInDisplayZone(d);
  const [y, mo, day] = ymd.split('-');
  return `${day}-${mo}-${y}`;
};

export const formatDateTime = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};
