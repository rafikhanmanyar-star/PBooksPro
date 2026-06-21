export class LeaveScopeError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'Employee is outside your department scope.') {
    super(message);
    this.name = 'LeaveScopeError';
  }
}

export class LeaveValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'LeaveValidationError';
  }
}

export class LeaveConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'LeaveConflictError';
  }
}

export const ATTENDANCE_LEAVE_CONFLICT_MESSAGE =
  'Attendance already exists for one or more leave dates.';

export class LeaveAttendanceConflictError extends LeaveConflictError {
  constructor(message = ATTENDANCE_LEAVE_CONFLICT_MESSAGE) {
    super(message);
    this.name = 'LeaveAttendanceConflictError';
  }
}
