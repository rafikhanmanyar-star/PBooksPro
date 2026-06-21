import { z } from 'zod';
import { LEAVE_STATUSES } from './leave.types.js';

export const leaveStatusSchema = z.enum(LEAVE_STATUSES);

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(120),
  annual_quota: z.coerce.number().int().min(0).optional(),
  annualQuota: z.coerce.number().int().min(0).optional(),
  paid_leave: z.boolean().optional(),
  paidLeave: z.boolean().optional(),
  carry_forward: z.boolean().optional(),
  carryForward: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const createLeaveRequestSchema = z.object({
  employee_id: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  leave_type_id: z.string().min(1).optional(),
  leaveTypeId: z.string().min(1).optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().max(2000).nullable().optional(),
  attachment_url: z.string().url().nullable().optional(),
  attachmentUrl: z.string().url().nullable().optional(),
});

export const updateLeaveRequestSchema = createLeaveRequestSchema.partial();

export const leaveRequestListQuerySchema = z.object({
  employeeId: z.string().optional(),
  employee_id: z.string().optional(),
  departmentId: z.string().optional(),
  department_id: z.string().optional(),
  leaveTypeId: z.string().optional(),
  leave_type_id: z.string().optional(),
  status: leaveStatusSchema.optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const leaveBalanceListQuerySchema = z.object({
  employeeId: z.string().optional(),
  employee_id: z.string().optional(),
  departmentId: z.string().optional(),
  department_id: z.string().optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const rejectLeaveSchema = z
  .object({
    rejection_reason: z.string().max(2000).optional(),
    rejectionReason: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const reason = (data.rejection_reason ?? data.rejectionReason ?? '').trim();
    if (!reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rejection reason is required.',
        path: ['rejection_reason'],
      });
    }
  });

export const approveLeaveSchema = z.object({
  remarks: z.string().max(2000).optional(),
  forceOverride: z.boolean().optional(),
  force_override: z.boolean().optional(),
});
