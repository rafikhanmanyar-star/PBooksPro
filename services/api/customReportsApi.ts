/**
 * Custom Report Builder — LAN / PostgreSQL API only.
 */

import { apiClient } from './client';

export const CUSTOM_REPORT_MODULE_PROJECT_SELLING = 'project_selling';
export const CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS = 'rental_agreements';

export const CUSTOM_REPORT_MODULES = [
  { key: CUSTOM_REPORT_MODULE_PROJECT_SELLING, label: 'Project selling' },
  { key: CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS, label: 'Rental agreements' },
] as const;

export type CustomReportModuleKey =
  (typeof CUSTOM_REPORT_MODULES)[number]['key'];

export type CustomReportFieldMeta = {
  key: string;
  label: string;
  type: string;
  entityGroup: string;
  filterable: boolean;
  sortable: boolean;
  aggregatable: boolean;
  searchable: boolean;
  kind?: 'calculated' | 'column';
  formula?: string;
};

export type CustomReportMetadataResponse = {
  module: string;
  modules?: { key: string; label: string }[];
  fields: CustomReportFieldMeta[];
  groupDimensions: string[];
  filterOperators: string[];
  aggregateOperations: string[];
};

export type GeneratedReportResponse = {
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, unknown>[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type CustomReportTemplateApiRow = {
  id: string;
  tenant_id: string;
  name: string;
  module: string;
  configuration_json: Record<string, unknown>;
  created_by: string | null;
  is_public: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchCustomReportMetadata(
  moduleKey: string = CUSTOM_REPORT_MODULE_PROJECT_SELLING
): Promise<CustomReportMetadataResponse> {
  return apiClient.get<CustomReportMetadataResponse>(
    `/reports/custom/metadata?module=${encodeURIComponent(moduleKey)}`
  );
}

export async function generateCustomReport(body: Record<string, unknown>): Promise<GeneratedReportResponse> {
  return apiClient.post<GeneratedReportResponse>('/reports/custom/generate', body);
}

/** Backend preview mode caps pageSize at 500. */
const CUSTOM_REPORT_PREVIEW_PAGE_SIZE = 500;
const CUSTOM_REPORT_MAX_PRINT_ROWS = 10_000;

/**
 * Fetch all filtered rows for print (paginates through preview API).
 * Capped at {@link CUSTOM_REPORT_MAX_PRINT_ROWS} rows.
 */
export async function fetchAllCustomReportRows(
  basePayload: Record<string, unknown>,
  totalCount: number
): Promise<GeneratedReportResponse> {
  const target = Math.min(totalCount, CUSTOM_REPORT_MAX_PRINT_ROWS);
  const allRows: Record<string, unknown>[] = [];
  let columns: GeneratedReportResponse['columns'] = [];
  let page = 1;

  while (allRows.length < target) {
    const data = await generateCustomReport({
      ...basePayload,
      page,
      pageSize: CUSTOM_REPORT_PREVIEW_PAGE_SIZE,
    });
    columns = data.columns;
    allRows.push(...data.rows);
    if (data.rows.length < CUSTOM_REPORT_PREVIEW_PAGE_SIZE || allRows.length >= data.totalCount) {
      break;
    }
    page += 1;
    if (page > Math.ceil(CUSTOM_REPORT_MAX_PRINT_ROWS / CUSTOM_REPORT_PREVIEW_PAGE_SIZE)) {
      break;
    }
  }

  const rows = allRows.slice(0, target);
  return {
    columns,
    rows,
    totalCount: Math.min(totalCount, rows.length),
    page: 1,
    pageSize: rows.length,
  };
}

export async function fetchCustomReportTemplates(
  module?: string
): Promise<CustomReportTemplateApiRow[]> {
  const q = module ? `?module=${encodeURIComponent(module)}` : '';
  return apiClient.get<CustomReportTemplateApiRow[]>(`/reports/custom/templates${q}`);
}

export async function saveCustomReportTemplate(body: Record<string, unknown>): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>('/reports/custom/save-template', body);
}

export async function updateCustomReportTemplate(
  id: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return apiClient.put<{ ok: boolean }>(
    `/reports/custom/template/${encodeURIComponent(id)}`,
    body
  );
}

export async function deleteCustomReportTemplate(id: string): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>(`/reports/custom/template/${encodeURIComponent(id)}`);
}

/** Binary export (CSV / XLSX / PDF) — bypasses JSON unwrap. */
export async function downloadCustomReportExport(params: {
  body: Record<string, unknown>;
  defaultFileName?: string;
}): Promise<void> {
  const token = apiClient.getToken();
  if (!token) throw new Error('Not authenticated');
  const url = `${apiClient.getBaseUrl()}/reports/custom/export`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.body),
  });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = await res.json();
      msg = (j?.error?.message as string) || (j?.message as string) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  let name = params.defaultFileName ?? 'custom-report';
  const m = cd?.match(/filename="([^"]+)"/);
  if (m?.[1]) name = m[1];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
