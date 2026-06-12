import { z } from 'zod';

export const REPORT_FILTER_OPS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'BETWEEN',
  'IN',
  'LIKE',
  'ILIKE',
  'IS NULL',
  'IS NOT NULL',
] as const;

export type ReportFilterOp = (typeof REPORT_FILTER_OPS)[number];

export const REPORT_AGG_OPS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'] as const;

const filterClauseSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(REPORT_FILTER_OPS),
  value: z.unknown().optional(),
  valueTo: z.unknown().optional(),
});

const sortClauseSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['ASC', 'DESC']).default('ASC'),
});

const aggregateClauseSchema = z.object({
  field: z.string().min(1),
  operation: z.enum(REPORT_AGG_OPS),
});

const columnProjectionSchema = z.object({
  key: z.string().min(1),
  headerLabel: z.string().optional(),
  widthPx: z.number().int().positive().max(640).optional(),
  visible: z.boolean().optional(),
  aggregateOperation: z.enum(REPORT_AGG_OPS).optional(),
});

const formulaSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  expression: z.string().min(1).max(2000),
});

/** Core payload object — safe to `.extend()` / `.omit()` before refinements. */
const customReportGenerateCoreObjectSchema = z.object({
  module: z.string().min(1).max(128),
  fields: z.array(z.string()).min(1).max(64).optional(),
  columns: z.array(columnProjectionSchema).max(64).optional(),
  filters: z.array(filterClauseSchema).max(128).optional(),
  groupBy: z.array(z.string()).max(32).optional(),
  sortBy: z.array(sortClauseSchema).max(32).optional(),
  aggregates: z.array(aggregateClauseSchema).max(32).optional(),
  formulas: z.array(formulaSchema).max(24).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(5000).optional().default(50),
  /** When true, allows pageSize up to 5000 (print-all flow). Preview remains capped at 500. */
  forPrint: z.boolean().optional(),
  /** When set to `aging`, uses dedicated aging SQL (fields optional). */
  reportType: z.string().max(40).optional(),
  /** As-of date for aging reports (YYYY-MM-DD). */
  agingAsOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function refinePageSize(
  data: z.infer<typeof customReportGenerateCoreObjectSchema>,
  ctx: z.RefinementCtx
): void {
  const ps = data.pageSize ?? 50;
  const max = data.forPrint ? 5000 : 500;
  if (ps > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: data.forPrint ? 'pageSize cannot exceed 5000 for print' : 'pageSize cannot exceed 500 for preview',
      path: ['pageSize'],
    });
  }
}

const customReportGenerateCoreSchema = customReportGenerateCoreObjectSchema.superRefine(refinePageSize);

function refineHasFieldsOrColumns(
  data: { columns?: unknown[]; fields?: unknown[] },
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[]
): void {
  const hasCols = Boolean(data.columns?.length);
  const hasFields = Boolean(data.fields?.length);
  if (!hasCols && !hasFields) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fields or columns is required',
      path: pathPrefix.length ? [...pathPrefix, 'fields'] : ['fields'],
    });
  }
}

export const customReportGenerateBodySchema = customReportGenerateCoreSchema.superRefine((data, ctx) => {
  if (data.reportType === 'aging') return;
  refineHasFieldsOrColumns(data, ctx, []);
});

export type CustomReportGeneratePayload = z.infer<typeof customReportGenerateBodySchema>;

export const customReportExportBodySchema = customReportGenerateCoreObjectSchema
  .extend({
    format: z.enum(['csv', 'xlsx', 'pdf']),
    reportName: z.string().max(200).optional(),
  })
  .superRefine(refinePageSize)
  .superRefine((data, ctx) => {
    if (data.reportType === 'aging') return;
    refineHasFieldsOrColumns(data, ctx, []);
  });

export const savedTemplateConfigurationSchema = customReportGenerateCoreObjectSchema.omit({
  module: true,
  page: true,
  pageSize: true,
});

export const saveTemplateSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(240),
    module: z.string().min(1).max(128),
    configuration_json: savedTemplateConfigurationSchema.partial(),
    is_public: z.boolean().optional(),
    is_default: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const cfg = data.configuration_json;
    if (!cfg || typeof cfg !== 'object') return;
    refineHasFieldsOrColumns(cfg as { columns?: unknown[]; fields?: unknown[] }, ctx, [
      'configuration_json',
    ]);
  });

export type SaveTemplatePayload = z.infer<typeof saveTemplateSchema>;

export const updateTemplateBodySchema = z
  .object({
    name: z.string().min(1).max(240).optional(),
    configuration_json: savedTemplateConfigurationSchema.partial().optional(),
    is_public: z.boolean().optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

export type UpdateTemplateBodyPayload = z.infer<typeof updateTemplateBodySchema>;
