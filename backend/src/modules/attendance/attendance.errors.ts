export const ATTENDANCE_DUPLICATE_MESSAGE =
  'Attendance already exists for this employee and date.';

export class AttendanceDuplicateError extends Error {
  readonly code = 'DUPLICATE';

  constructor(message = ATTENDANCE_DUPLICATE_MESSAGE) {
    super(message);
    this.name = 'AttendanceDuplicateError';
  }
}

export class AttendanceScopeError extends Error {
  readonly code = 'FORBIDDEN';

  constructor(message = 'Employee is outside your department scope.') {
    super(message);
    this.name = 'AttendanceScopeError';
  }
}

export function isAttendanceUniqueViolation(e: unknown): boolean {
  const pg = e as { code?: string; constraint?: string; message?: string };
  if (pg?.code !== '23505') return false;
  if (pg.constraint === 'uq_attendance_records_tenant_employee_date_active') return true;
  const msg = pg.message ?? '';
  return msg.includes('uq_attendance_records_tenant_employee_date_active') || msg.includes('attendance_records');
}

export function toAttendanceDuplicateError(e: unknown): AttendanceDuplicateError | null {
  if (e instanceof AttendanceDuplicateError) return e;
  if (isAttendanceUniqueViolation(e)) return new AttendanceDuplicateError();
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (msg.includes('attendance already exists')) {
      return new AttendanceDuplicateError(ATTENDANCE_DUPLICATE_MESSAGE);
    }
  }
  return null;
}
