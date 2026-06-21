import { z } from 'zod';
import { ATTENDANCE_STATUSES } from './attendance.types.js';

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

export const createAttendanceSchema = z.object({
  employee_id: z.string().min(1),
  employeeId: z.string().min(1).optional(),
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: attendanceStatusSchema,
  check_in: z.string().nullable().optional(),
  checkIn: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  checkOut: z.string().nullable().optional(),
  late_minutes: z.coerce.number().int().min(0).optional(),
  lateMinutes: z.coerce.number().int().min(0).optional(),
  remarks: z.string().nullable().optional(),
});

export const updateAttendanceSchema = createAttendanceSchema.partial().extend({
  status: attendanceStatusSchema.optional(),
});

export const bulkAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z
    .array(
      z.object({
        employee_id: z.string().min(1),
        employeeId: z.string().min(1).optional(),
        status: attendanceStatusSchema,
        check_in: z.string().nullable().optional(),
        checkIn: z.string().nullable().optional(),
        check_out: z.string().nullable().optional(),
        checkOut: z.string().nullable().optional(),
        late_minutes: z.coerce.number().int().min(0).optional(),
        lateMinutes: z.coerce.number().int().min(0).optional(),
        remarks: z.string().nullable().optional(),
      })
    )
    .min(1),
});

export const listAttendanceQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  employeeId: z.string().optional(),
  employee_id: z.string().optional(),
  departmentId: z.string().optional(),
  department_id: z.string().optional(),
  status: attendanceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const monthlySheetQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(3000),
  departmentId: z.string().optional(),
  department_id: z.string().optional(),
});
