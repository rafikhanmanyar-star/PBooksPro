import { z } from 'zod';
import { savedTemplateConfigurationSchema } from './reportConfigurationSchema.js';

export const reportVisibilitySchema = z.enum(['private', 'team', 'company']);

export const saveReportDefinitionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(120).optional(),
  module: z.string().min(1).max(80),
  reportType: z.string().min(1).max(40).default('tabular'),
  tags: z.array(z.string().max(40)).max(20).optional(),
  visibility: reportVisibilitySchema.default('private'),
  configuration: savedTemplateConfigurationSchema,
});

export const updateReportDefinitionSchema = saveReportDefinitionSchema
  .partial()
  .extend({ configuration: savedTemplateConfigurationSchema.optional() });

export const reportScheduleCadenceSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly']);
export const reportExportFormatSchema = z.enum(['pdf', 'xlsx', 'csv']);

export const saveReportScheduleSchema = z.object({
  reportDefinitionId: z.string().min(1),
  cadence: reportScheduleCadenceSchema,
  recipients: z.array(z.string().email()).min(1).max(20),
  exportFormat: reportExportFormatSchema.default('xlsx'),
  timezone: z.string().max(64).optional(),
  isActive: z.boolean().optional(),
});

export const updateReportScheduleSchema = saveReportScheduleSchema
  .omit({ reportDefinitionId: true })
  .partial();

export const saveReportShareSchema = z
  .object({
    sharedWithUserId: z.string().min(1).optional(),
    sharedWithRole: z.string().min(1).max(64).optional(),
    permission: z.enum(['view', 'edit', 'clone', 'delete']).default('view'),
  })
  .refine((v) => Boolean(v.sharedWithUserId || v.sharedWithRole), {
    message: 'sharedWithUserId or sharedWithRole is required',
  });

export type SaveReportDefinitionPayload = z.infer<typeof saveReportDefinitionSchema>;
