/**
 * Shared registry types for metadata-driven custom reports.
 * Extensible: add new modules by registering fields + a query compiler.
 */

export type ReportFieldDataType = 'string' | 'number' | 'date' | 'boolean';

export type ReportFieldEntityGroup =
  | 'Project Selling'
  | 'Projects'
  | 'Units'
  | 'Customers'
  | 'Owners'
  | 'Brokers'
  | 'Accounts & ledger'
  | 'Installments & invoices'
  | 'Payments & receipts'
  | 'Discounts & pricing'
  | 'Commission & rebates'
  | 'Returns & refunds'
  | 'Possession & assets'
  | 'Categories'
  | 'Chart of accounts (reference)'
  | 'Investor / installment reference';

/** DB-level SQL snippet; must reference only compiler-controlled aliases */
export interface ReportFieldDefinition {
  key: string;
  label: string;
  /** Logical source table (documentation / UX grouping) */
  sourceTable?: string;
  type: ReportFieldDataType;
  filterable?: boolean;
  sortable?: boolean;
  aggregatable?: boolean;
  searchable?: boolean;
  /** Postgres expression for projection & filters */
  sqlExpr: string;
  entityGroup: ReportFieldEntityGroup;
}

export interface ReportComputedFieldDefinition extends Omit<ReportFieldDefinition, 'aggregatable'> {
  kind: 'calculated';
  /** Human-readable formula for UI display */
  formula: string;
  /** Depends on registry keys referenced in formulas (post-SQL evaluation) */
  dependsOn?: string[];
}

export type RegisteredField = ReportFieldDefinition | ReportComputedFieldDefinition;

export function isCalculatedField(
  f: RegisteredField
): f is ReportComputedFieldDefinition {
  return 'kind' in f && f.kind === 'calculated';
}
