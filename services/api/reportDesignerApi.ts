import { apiClient } from './client';

export type ReportVisibility = 'private' | 'team' | 'company';

export type SavedReportDefinition = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  category: string | null;
  module: string;
  reportType: string;
  tags: string[];
  visibility: ReportVisibility;
  configuration: Record<string, unknown>;
  createdBy: string | null;
  updatedAt: string;
  isFavorite: boolean;
  pinned: boolean;
  lastOpenedAt: string | null;
};

export type ReportDesignerLibrary = {
  definitions: SavedReportDefinition[];
  favorites: SavedReportDefinition[];
  recent: SavedReportDefinition[];
};

export async function fetchReportDesignerLibrary(module?: string): Promise<ReportDesignerLibrary> {
  const q = module ? `?module=${encodeURIComponent(module)}` : '';
  return apiClient.get<ReportDesignerLibrary>(`/reports/designer/library${q}`);
}

export type DesignerCatalogTemplate = {
  id: string;
  module: string;
  name: string;
  description: string | null;
  reportType: string;
  category: string | null;
  configuration: Record<string, unknown>;
  sortOrder: number;
};

export async function fetchDesignerCatalogTemplates(
  module?: string
): Promise<DesignerCatalogTemplate[]> {
  const q = module ? `?module=${encodeURIComponent(module)}` : '';
  const res = await apiClient.get<{ templates: DesignerCatalogTemplate[] }>(
    `/reports/designer/catalog-templates${q}`
  );
  return res.templates;
}

export async function saveReportDefinition(body: {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  module: string;
  reportType: string;
  tags?: string[];
  visibility: ReportVisibility;
  configuration: Record<string, unknown>;
}): Promise<{ id: string }> {
  if (body.id) {
    await apiClient.put(`/reports/designer/definitions/${encodeURIComponent(body.id)}`, body);
    return { id: body.id };
  }
  return apiClient.post<{ id: string }>('/reports/designer/definitions', body);
}

export async function deleteReportDefinition(id: string): Promise<void> {
  await apiClient.delete(`/reports/designer/definitions/${encodeURIComponent(id)}`);
}

export async function toggleReportFavorite(
  id: string,
  pinned = false
): Promise<{ favorited: boolean }> {
  return apiClient.post<{ favorited: boolean }>(
    `/reports/designer/definitions/${encodeURIComponent(id)}/favorite`,
    { pinned }
  );
}

export async function recordReportOpened(id: string): Promise<void> {
  await apiClient.post(`/reports/designer/definitions/${encodeURIComponent(id)}/open`, {});
}

export type ReportSchedule = {
  id: string;
  reportDefinitionId: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  timezone: string;
  recipients: string[];
  exportFormat: 'pdf' | 'xlsx' | 'csv';
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  definitionName: string | null;
};

export type ReportDashboardPin = {
  id: string;
  reportDefinitionId: string;
  sortOrder: number;
  name: string;
  module: string;
  reportType: string;
  configuration: Record<string, unknown>;
};

export async function fetchReportSchedules(definitionId: string): Promise<ReportSchedule[]> {
  const res = await apiClient.get<{ schedules: ReportSchedule[] }>(
    `/reports/designer/definitions/${encodeURIComponent(definitionId)}/schedules`
  );
  return res.schedules;
}

export async function createReportSchedule(body: {
  reportDefinitionId: string;
  cadence: ReportSchedule['cadence'];
  recipients: string[];
  exportFormat?: ReportSchedule['exportFormat'];
}): Promise<{ id: string; nextRunAt: string }> {
  return apiClient.post('/reports/designer/schedules', body);
}

export async function deleteReportSchedule(id: string): Promise<void> {
  await apiClient.delete(`/reports/designer/schedules/${encodeURIComponent(id)}`);
}

export async function updateReportSchedule(
  id: string,
  body: {
    cadence?: ReportSchedule['cadence'];
    recipients?: string[];
    exportFormat?: ReportSchedule['exportFormat'];
    isActive?: boolean;
  }
): Promise<void> {
  await apiClient.put(`/reports/designer/schedules/${encodeURIComponent(id)}`, body);
}

export type ReportShare = {
  id: string;
  sharedWithUserId: string | null;
  sharedWithRole: string | null;
  permission: 'view' | 'edit' | 'clone' | 'delete';
  userName: string | null;
  userUsername: string | null;
  createdAt: string;
};

export async function fetchReportShares(definitionId: string): Promise<ReportShare[]> {
  const res = await apiClient.get<{ shares: ReportShare[] }>(
    `/reports/designer/definitions/${encodeURIComponent(definitionId)}/shares`
  );
  return res.shares;
}

export async function createReportShare(
  definitionId: string,
  body: {
    sharedWithUserId?: string;
    sharedWithRole?: string;
    permission?: ReportShare['permission'];
  }
): Promise<{ id: string }> {
  return apiClient.post(`/reports/designer/definitions/${encodeURIComponent(definitionId)}/shares`, body);
}

export async function deleteReportShare(shareId: string): Promise<void> {
  await apiClient.delete(`/reports/designer/shares/${encodeURIComponent(shareId)}`);
}

export async function fetchReportDashboardPins(): Promise<ReportDashboardPin[]> {
  const res = await apiClient.get<{ pins: ReportDashboardPin[] }>('/reports/designer/dashboard-pins');
  return res.pins;
}

export async function pinReportToDashboard(reportDefinitionId: string): Promise<{ id: string }> {
  return apiClient.post('/reports/designer/dashboard-pins', { reportDefinitionId });
}

export async function unpinReportFromDashboard(reportDefinitionId: string): Promise<void> {
  await apiClient.delete(
    `/reports/designer/dashboard-pins/${encodeURIComponent(reportDefinitionId)}`
  );
}
