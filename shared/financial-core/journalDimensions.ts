/**
 * Normalize and resolve project / building / cost-center dimensions for GL posting.
 */

import type { JournalLineInput } from './types';

export interface JournalDimensions {
  projectId: string | null;
  buildingId: string | null;
  costCenterId: string | null;
}

/** Trim and drop empty strings; null/undefined → null. */
export function normalizeDimensionId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Read dimension fields from a source row or API body (snake_case or camelCase).
 */
export function resolveJournalDimensions(source: unknown): JournalDimensions {
  const src =
    source != null && typeof source === 'object' ? (source as Record<string, unknown>) : {};

  return {
    projectId: normalizeDimensionId(src.projectId ?? src.project_id),
    buildingId: normalizeDimensionId(src.buildingId ?? src.building_id),
    costCenterId: normalizeDimensionId(
      src.costCenterId ?? src.cost_center_id ?? src.cost_center_code
    ),
  };
}

export type JournalEntryDimensionFields = {
  projectId?: string | null;
  buildingId?: string | null;
  costCenterId?: string | null;
};

/** Entry-level dimension fields for CreateJournalBody / CreateJournalEntryInput. */
export function entryDimensionsFrom(dims: JournalDimensions): JournalEntryDimensionFields {
  return {
    projectId: dims.projectId,
    buildingId: dims.buildingId,
    costCenterId: dims.costCenterId,
  };
}

/** Build a balanced journal line with all dimension fields set. */
export function journalLineWithDimensions(
  line: {
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    projectId?: string | null;
    buildingId?: string | null;
    costCenterId?: string | null;
  },
  dims?: JournalDimensions
): JournalLineInput {
  const resolved = dims ?? resolveJournalDimensions(line);
  return {
    accountId: line.accountId,
    debitAmount: line.debitAmount,
    creditAmount: line.creditAmount,
    projectId: normalizeDimensionId(line.projectId) ?? resolved.projectId,
    buildingId: normalizeDimensionId(line.buildingId) ?? resolved.buildingId,
    costCenterId: normalizeDimensionId(line.costCenterId) ?? resolved.costCenterId,
  };
}
