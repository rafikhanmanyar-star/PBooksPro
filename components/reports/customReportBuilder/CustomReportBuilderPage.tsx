/**
 * Universal Report Designer — metadata-driven custom reports (PostgreSQL / LAN API).
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useNotification } from '../../../context/NotificationContext';
import { usePrintReport } from '../../../hooks/usePrintReport';
import ReportHeader from '../ReportHeader';
import ReportFooter from '../ReportFooter';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import {
  CUSTOM_REPORT_MODULE_PROJECT_SELLING,
  CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION,
  CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS,
  CUSTOM_REPORT_MODULES,
  fetchCustomReportMetadata,
  generateCustomReport,
  fetchAllCustomReportRows,
  CUSTOM_REPORT_MAX_PRINT_ROWS,
  fetchCustomReportTemplates,
  saveCustomReportTemplate,
  deleteCustomReportTemplate,
  downloadCustomReportExport,
  type CustomReportFieldMeta,
  type CustomReportModuleKey,
  type GeneratedReportResponse,
  type CustomReportTemplateApiRow,
} from '../../../services/api/customReportsApi';
import {
  deleteReportDefinition,
  fetchReportDesignerLibrary,
  fetchReportDashboardPins,
  fetchDesignerCatalogTemplates,
  type DesignerCatalogTemplate,
  pinReportToDashboard,
  unpinReportFromDashboard,
  recordReportOpened,
  saveReportDefinition,
  toggleReportFavorite,
  type ReportVisibility,
  type SavedReportDefinition,
} from '../../../services/api/reportDesignerApi';
import ReportLibraryPanel from '../../../modules/report-designer/components/ReportLibraryPanel';
import ReportSchedulePanel from '../../../modules/report-designer/components/ReportSchedulePanel';
import ReportSharePanel from '../../../modules/report-designer/components/ReportSharePanel';
import ReportChartPreview from '../../../modules/report-designer/components/ReportChartPreview';
import {
  defaultKeysForModule,
  MODULE_DEFAULT_SORT_FIELD,
} from '../../../modules/report-designer/config/moduleDefaults';
import {
  BUILTIN_REPORT_TEMPLATES,
  REPORT_TYPES,
  templatesForModule,
  type ReportTypeId,
  type ReportTemplatePreset,
} from '../../../modules/report-designer/config/reportTemplates';

const FAVORITES_STORAGE_KEY = 'pbooks_report_designer_favorites';

function defaultCountFieldKey(
  fields: CustomReportFieldMeta[],
  moduleKey: CustomReportModuleKey
): string {
  const nonCalculated = fields.filter((f) => f.kind !== 'calculated');
  const fallback =
    moduleKey === CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS
      ? 'agreement_number'
      : moduleKey === CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION
        ? 'contract_number'
        : 'booking_no';
  return nonCalculated.find((f) => f.aggregatable)?.key ?? nonCalculated[0]?.key ?? fallback;
}

function detailKeysForPayload(
  selectedKeys: string[],
  fields: CustomReportFieldMeta[],
  grouped: boolean
): string[] {
  if (!grouped) return selectedKeys;
  return selectedKeys.filter((k) => fields.find((f) => f.key === k)?.kind !== 'calculated');
}

export type BuilderAggregateRow = {
  id: string;
  field: string;
  operation: string;
};

const columnHelper = createColumnHelper<Record<string, unknown>>();

function groupFieldsByEntity(fields: CustomReportFieldMeta[]) {
  const m = new Map<string, CustomReportFieldMeta[]>();
  for (const f of fields) {
    const g = f.entityGroup || 'General';
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(f);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function roleLc(role?: string): string {
  return (role ?? '').toLowerCase();
}

function backendReportCapability(role?: string): {
  canCreate: boolean;
  canExport: boolean;
  canShare: boolean;
} {
  const r = roleLc(role);
  const adminLike = r === 'admin' || r === 'super_admin';
  const finance = adminLike || r === 'accountant' || r === 'accounts';
  return {
    canCreate: finance,
    canExport: finance,
    canShare: adminLike,
  };
}

export type BuilderFilterRow = {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueTo?: string;
};

export type ReportDesignerPageProps = {
  title?: string;
  subtitle?: string;
  initialModule?: CustomReportModuleKey;
  lockModule?: boolean;
  showModulePicker?: boolean;
};

export const CustomReportBuilderPage: React.FC<ReportDesignerPageProps> = ({
  title = 'Report Designer',
  subtitle = 'Design custom reports with drag-and-drop fields, filters, grouping, and formulas.',
  initialModule = CUSTOM_REPORT_MODULE_PROJECT_SELLING,
  lockModule = false,
  showModulePicker,
}) => {
  const modulePickerVisible = showModulePicker ?? !lockModule;
  const { user } = useAuth();
  const { showConfirm } = useNotification();
  const cap = backendReportCapability(user?.role);
  const printReport = usePrintReport();

  const [moduleKey, setModuleKey] = useState<CustomReportModuleKey>(initialModule);
  const [reportType, setReportType] = useState<ReportTypeId>('tabular');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => defaultKeysForModule(initialModule));
  const [columnSettings, setColumnSettings] = useState<
    Record<string, { headerLabel?: string; align?: 'left' | 'center' | 'right'; width?: string }>
  >({});
  const [selectedCanvasKey, setSelectedCanvasKey] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [filters, setFilters] = useState<BuilderFilterRow[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<BuilderAggregateRow[]>([]);
  const [sortField, setSortField] = useState(MODULE_DEFAULT_SORT_FIELD[initialModule]);
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [templateName, setTemplateName] = useState('');
  const [activeDefinitionId, setActiveDefinitionId] = useState<string | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportCategory, setReportCategory] = useState('');
  const [reportTags, setReportTags] = useState('');
  const [definitionOwnerId, setDefinitionOwnerId] = useState<string | null>(null);
  const [reportVisibility, setReportVisibility] = useState<ReportVisibility>('private');
  const [formulaExpr, setFormulaExpr] = useState('');
  const [formulaKey, setFormulaKey] = useState('pct_sample');
  const [formulaLabel, setFormulaLabel] = useState('Sample % calc');
  const [userFormulas, setUserFormulas] = useState<{ key: string; label: string; expression: string }[]>(
    []
  );

  const [preview, setPreview] = useState<GeneratedReportResponse | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<GeneratedReportResponse | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const localOnly = isLocalOnlyMode();

  const metaQuery = useQuery({
    queryKey: ['customReportMetadata', moduleKey],
    queryFn: () => fetchCustomReportMetadata(moduleKey),
    enabled: !localOnly,
  });

  const templatesQuery = useQuery({
    queryKey: ['customReportTemplates', moduleKey],
    queryFn: () => fetchCustomReportTemplates(moduleKey),
    enabled: !localOnly,
  });

  const libraryQuery = useQuery({
    queryKey: ['reportDesignerLibrary', moduleKey],
    queryFn: () => fetchReportDesignerLibrary(moduleKey),
    enabled: !localOnly,
  });

  const dashboardPinsQuery = useQuery({
    queryKey: ['reportDashboardPins'],
    queryFn: fetchReportDashboardPins,
    enabled: !localOnly,
  });

  const catalogTemplatesQuery = useQuery({
    queryKey: ['reportDesignerCatalogTemplates', moduleKey],
    queryFn: () => fetchDesignerCatalogTemplates(moduleKey),
    enabled: !localOnly,
  });

  function mapCatalogTemplate(row: DesignerCatalogTemplate): ReportTemplatePreset {
    const cfg = row.configuration ?? {};
    const reportType = (
      typeof cfg.reportType === 'string' ? cfg.reportType : row.reportType
    ) as ReportTypeId;
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      module: row.module as CustomReportModuleKey,
      reportType,
      fields: Array.isArray(cfg.fields) ? (cfg.fields as string[]) : [],
      groupBy: Array.isArray(cfg.groupBy) ? (cfg.groupBy as string[]) : undefined,
      filters: Array.isArray(cfg.filters)
        ? (cfg.filters as { field: string; operator: string; value: string }[])
        : undefined,
      aggregates: Array.isArray(cfg.aggregates)
        ? (cfg.aggregates as { field: string; operation: string }[])
        : undefined,
    };
  }

  const moduleTemplates = useMemo((): ReportTemplatePreset[] => {
    const fromApi = catalogTemplatesQuery.data ?? [];
    if (fromApi.length > 0) {
      return fromApi.map(mapCatalogTemplate);
    }
    return templatesForModule(moduleKey);
  }, [catalogTemplatesQuery.data, moduleKey]);

  const isPinnedToDashboard = useMemo(
    () =>
      activeDefinitionId
        ? (dashboardPinsQuery.data ?? []).some((p) => p.reportDefinitionId === activeDefinitionId)
        : false,
    [activeDefinitionId, dashboardPinsQuery.data]
  );

  const queryClient = useQueryClient();

  const grouped = useMemo(
    () => groupFieldsByEntity(metaQuery.data?.fields ?? []),
    [metaQuery.data?.fields]
  );

  const buildPayload = useCallback(() => {
    if (reportType === 'aging') {
      return {
        module: moduleKey,
        reportType: 'aging',
        page,
        pageSize,
      };
    }
    const fieldMeta = metaQuery.data?.fields ?? [];
    const isGroupedMode = groupBy.length > 0;
    const base: Record<string, unknown> = {
      module: moduleKey,
      fields: detailKeysForPayload(selectedKeys, fieldMeta, isGroupedMode),
      filters: filters.map((f) => {
        const row: Record<string, unknown> = {
          field: f.field,
          operator: f.operator,
        };
        if (f.operator !== 'IS NULL' && f.operator !== 'IS NOT NULL') {
          if (f.operator === 'IN') row.value = f.value.split(',').map((s) => s.trim()).filter(Boolean);
          else if (f.operator === 'BETWEEN') {
            row.value = f.value;
            row.valueTo = f.valueTo;
          } else {
            row.value = f.value;
          }
        }
        return row;
      }),
      sortBy: [{ field: sortField, direction: sortDir }],
      search: search.trim() || undefined,
      page,
      pageSize,
    };
    if (isGroupedMode) {
      base.groupBy = groupBy;
      base.aggregates = aggregates.length
        ? aggregates.map(({ field, operation }) => ({ field, operation }))
        : [{ field: defaultCountFieldKey(fieldMeta, moduleKey), operation: 'COUNT' }];
    }
    if (userFormulas.length && !isGroupedMode) base.formulas = userFormulas;
    const columnConfigs = selectedKeys
      .filter((k) => columnSettings[k]?.headerLabel || columnSettings[k]?.align || columnSettings[k]?.width)
      .map((k) => ({
        key: k,
        headerLabel: columnSettings[k]?.headerLabel,
        align: columnSettings[k]?.align,
        width: columnSettings[k]?.width,
      }));
    if (columnConfigs.length) base.columns = columnConfigs;
    if (reportType !== 'tabular') base.reportType = reportType;
    return base;
  }, [
    moduleKey,
    reportType,
    selectedKeys,
    filters,
    groupBy,
    aggregates,
    sortField,
    sortDir,
    search,
    page,
    pageSize,
    userFormulas,
    metaQuery.data?.fields,
    columnSettings,
  ]);

  const runMutation = useMutation({
    mutationFn: (override: Record<string, unknown> = {}) =>
      generateCustomReport({
        ...buildPayload(),
        ...override,
      }),
    onSuccess: (data) => {
      setPreview(data);
      setPrintSnapshot(null);
      setPreviewError(null);
    },
    onError: (e: Error | { message?: string }) => {
      setPreview(null);
      setPreviewError(typeof e?.message === 'string' ? e.message : String(e));
    },
  });

  const tableColumns = useMemo(() => {
    const cols = preview?.columns ?? [];
    return cols.map((col) =>
      columnHelper.accessor(
        (row) => {
          const v = row[col.key];
          if (v !== undefined && v !== null) return v;
          const lk = col.key.toLowerCase();
          for (const [k, val] of Object.entries(row)) {
            if (k.toLowerCase() === lk) return val;
          }
          return undefined;
        },
        {
          id: col.key,
          header: col.label ?? col.key,
          cell: (info) => {
            const val = info.getValue();
            return val === null || val === undefined ? '' : String(val);
          },
        }
      )
    );
  }, [preview]);

  const table = useReactTable({
    data: preview?.rows ?? [],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const printTableColumns = useMemo(() => {
    const cols = printSnapshot?.columns ?? preview?.columns ?? [];
    return cols.map((col) =>
      columnHelper.accessor(
        (row) => {
          const v = row[col.key];
          if (v !== undefined && v !== null) return v;
          const lk = col.key.toLowerCase();
          for (const [k, val] of Object.entries(row)) {
            if (k.toLowerCase() === lk) return val;
          }
          return undefined;
        },
        {
          id: col.key,
          header: col.label ?? col.key,
          cell: (info) => {
            const val = info.getValue();
            return val === null || val === undefined ? '' : String(val);
          },
        }
      )
    );
  }, [printSnapshot, preview, columnHelper]);

  const printTable = useReactTable({
    data: printSnapshot?.rows ?? preview?.rows ?? [],
    columns: printTableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handlePrintReport = useCallback(async () => {
    if (!preview) return;

    if (preview.totalCount > CUSTOM_REPORT_MAX_PRINT_ROWS) {
      const downloadPdf = await showConfirm(
        `This report has ${preview.totalCount.toLocaleString()} rows. Browser print is limited to ${CUSTOM_REPORT_MAX_PRINT_ROWS.toLocaleString()} rows. Download the full PDF export, or print only the first ${CUSTOM_REPORT_MAX_PRINT_ROWS.toLocaleString()} rows?`,
        {
          title: 'Large report',
          confirmLabel: 'Download PDF',
          cancelLabel: `Print first ${CUSTOM_REPORT_MAX_PRINT_ROWS.toLocaleString()}`,
        }
      );
      if (downloadPdf) {
        try {
          await downloadCustomReportExport({
            body: { ...buildPayload(), format: 'pdf', reportName: templateName },
          });
        } catch (e) {
          setPreviewError(e instanceof Error ? e.message : String(e));
        }
        return;
      }
    }

    setPrintLoading(true);
    try {
      let snapshot = preview;
      if (preview.totalCount > preview.rows.length) {
        snapshot = await fetchAllCustomReportRows(buildPayload(), preview.totalCount);
      }
      setPrintSnapshot(snapshot);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      printReport({ elementId: 'custom-report-print-area' });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrintLoading(false);
    }
  }, [preview, buildPayload, printReport, showConfirm, templateName]);

  /** Stable key so dynamic column sets remount after each successful preview (avoids stale column-visibility / cell maps). */
  const previewTableMountKey = preview
    ? `${preview.columns.map((c) => c.key).join('|')}::${preview.rows.length}::p${page}`
    : 'empty';

  const switchModule = (next: CustomReportModuleKey) => {
    if (next === moduleKey) return;
    setModuleKey(next);
    setSelectedKeys(defaultKeysForModule(next));
    setSortField(MODULE_DEFAULT_SORT_FIELD[next]);
    setGroupBy([]);
    setAggregates([]);
    setFilters([]);
    setUserFormulas([]);
    setColumnSettings({});
    setSelectedCanvasKey(null);
    setReportType('tabular');
    setPreview(null);
    setPreviewError(null);
    setPage(1);
    setTemplateName('');
    setActiveDefinitionId(null);
    setReportDescription('');
    setReportCategory('');
    setReportTags('');
    setDefinitionOwnerId(null);
    setReportVisibility('private');
    void queryClient.invalidateQueries({ queryKey: ['reportDesignerLibrary'] });
  };

  const applyTemplate = (templateId: string) => {
    const preset = moduleTemplates.find((t) => t.id === templateId);
    if (!preset || (lockModule && preset.module !== moduleKey)) return;
    if (preset.module !== moduleKey && !lockModule) {
      switchModule(preset.module);
    }
    setSelectedKeys(preset.fields);
    setGroupBy(preset.groupBy ?? []);
    if (preset.aggregates?.length) {
      setAggregates(
        preset.aggregates.map((a, i) => ({
          id: `tpl-agg-${i}`,
          field: a.field,
          operation: a.operation,
        }))
      );
    } else {
      setAggregates([]);
    }
    setReportType(
      preset.reportType === 'aging' || preset.reportType === 'ledger' || preset.reportType === 'chart'
        ? preset.reportType
        : preset.reportType === 'grouped' || preset.reportType === 'summary'
          ? 'grouped'
          : 'tabular'
    );
    if (preset.filters?.length) {
      setFilters(
        preset.filters.map((f, i) => ({
          id: `tpl-${i}`,
          field: f.field,
          operator: f.operator,
          value: f.value,
        }))
      );
    }
    setTemplateName(preset.name);
    setPreview(null);
  };

  const toggleFavorite = (templateId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId];
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const addFieldToCanvas = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setSelectedCanvasKey(key);
  };

  const handleFieldDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    if (key) addFieldToCanvas(key);
  };

  const addAggregateRow = () => {
    const firstAgg =
      metaQuery.data?.fields.find((f) => f.aggregatable)?.key ??
      selectedKeys[0] ??
      'booking_no';
    setAggregates((prev) => [
      ...prev,
      { id: crypto.randomUUID(), field: firstAgg, operation: 'SUM' },
    ]);
  };

  const moduleLabel =
    CUSTOM_REPORT_MODULES.find((m) => m.key === moduleKey)?.label ??
    metaQuery.data?.modules?.find((m) => m.key === moduleKey)?.label ??
    'Custom report';

  const moduleMeta = metaQuery.data?.modules?.find((m) => m.key === moduleKey);

  const toggleField = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        if (selectedCanvasKey === key) setSelectedCanvasKey(null);
        return prev.filter((k) => k !== key);
      }
      setSelectedCanvasKey(key);
      return [...prev, key];
    });
  };

  const addFilterRow = () => {
    const first = metaQuery.data?.fields.find((f) => f.filterable)?.key ?? 'booking_no';
    setFilters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), field: first, operator: '=', value: '' },
    ]);
  };

  const loadTemplateRow = async (row: CustomReportTemplateApiRow) => {
    applyConfiguration(row.configuration_json ?? {}, row.name, row.module as CustomReportModuleKey | undefined);
    setActiveDefinitionId(null);
    setPage(1);
    runMutation.mutate({ page: 1 });
  };

  const applyConfiguration = (
    cfg: Record<string, unknown>,
    name: string,
    mod?: CustomReportModuleKey,
    rType?: string
  ) => {
    if (mod && !lockModule) setModuleKey(mod);
    if (typeof cfg.fields === 'object' && Array.isArray(cfg.fields)) {
      setSelectedKeys(cfg.fields as string[]);
    }
    if (cfg.reportType && typeof cfg.reportType === 'string') {
      setReportType(cfg.reportType as ReportTypeId);
    } else if (rType) {
      setReportType(rType as ReportTypeId);
    }
    if (cfg.groupBy) setGroupBy(cfg.groupBy as string[]);
    if (cfg.aggregates && Array.isArray(cfg.aggregates)) {
      setAggregates(
        (cfg.aggregates as { field?: string; operation?: string }[]).map((a, i) => ({
          id: `agg${i}`,
          field: String(a.field ?? ''),
          operation: String(a.operation ?? 'COUNT'),
        }))
      );
    } else {
      setAggregates([]);
    }
    if (cfg.filters) {
      const arr = (cfg.filters as Record<string, unknown>[]).map((f, i) => ({
        id: `r${i}`,
        field: String(f.field ?? ''),
        operator: String(f.operator ?? '='),
        value: typeof f.value === 'string' ? f.value : String(f.value ?? ''),
        valueTo: f.valueTo != null ? String(f.valueTo) : undefined,
      }));
      setFilters(arr.length ? arr : []);
    }
    if (cfg.formulas && Array.isArray(cfg.formulas)) {
      setUserFormulas(cfg.formulas as typeof userFormulas);
    }
    if (cfg.sortBy && Array.isArray(cfg.sortBy) && cfg.sortBy[0]) {
      const s0 = cfg.sortBy[0] as { field?: string; direction?: string };
      if (s0.field) setSortField(s0.field);
      if (s0.direction === 'ASC' || s0.direction === 'DESC') setSortDir(s0.direction);
    }
    setTemplateName(name);
  };

  const buildConfigurationObject = (): Record<string, unknown> => ({
    reportType,
    fields: selectedKeys,
    columns: selectedKeys.map((k) => ({ key: k, ...columnSettings[k] })).filter(
      (c) => c.headerLabel || c.align || c.width
    ),
    filters: filters.map(({ field, operator, value, valueTo }) => {
      const o: Record<string, unknown> = { field, operator };
      if (operator !== 'IS NULL' && operator !== 'IS NOT NULL') {
        if (operator === 'IN') o.value = value.split(',').map((s) => s.trim());
        else if (operator === 'BETWEEN') {
          o.value = value;
          o.valueTo = valueTo;
        } else {
          o.value = value;
        }
      }
      return o;
    }),
    groupBy,
    aggregates: aggregates.map(({ field, operation }) => ({ field, operation })),
    sortBy: [{ field: sortField, direction: sortDir }],
    formulas: userFormulas,
  });

  const loadSavedDefinition = async (row: SavedReportDefinition) => {
    applyConfiguration(row.configuration ?? {}, row.name, row.module as CustomReportModuleKey, row.reportType);
    setActiveDefinitionId(row.id);
    setDefinitionOwnerId(row.createdBy);
    setReportDescription(row.description ?? '');
    setReportCategory(row.category ?? '');
    setReportTags((row.tags ?? []).join(', '));
    setReportVisibility(row.visibility);
    setPage(1);
    try {
      await recordReportOpened(row.id);
      await libraryQuery.refetch();
    } catch {
      /* non-blocking */
    }
    runMutation.mutate({ page: 1 });
  };

  const handleToggleFavoriteDefinition = async (id: string) => {
    try {
      await toggleReportFavorite(id);
      await libraryQuery.refetch();
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteDefinition = async (id: string) => {
    const ok = await showConfirm('Delete this saved report?', { title: 'Delete report', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await deleteReportDefinition(id);
      if (activeDefinitionId === id) setActiveDefinitionId(null);
      await libraryQuery.refetch();
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveTemplate = async (opts: { isPublic: boolean; isDefault: boolean }) => {
    if (!cap.canCreate) return;
    const name = templateName.trim() || 'Untitled report';
    const visibility: ReportVisibility = opts.isPublic ? 'company' : reportVisibility;
    try {
      const { id } = await saveReportDefinition({
        id: activeDefinitionId ?? undefined,
        name,
        description: reportDescription.trim() || undefined,
        category: reportCategory.trim() || undefined,
        tags: reportTags
          .split(/[,;]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        module: moduleKey,
        reportType,
        visibility,
        configuration: buildConfigurationObject(),
      });
      setActiveDefinitionId(id);
      setDefinitionOwnerId(user?.id ?? null);
      await libraryQuery.refetch();
      await saveCustomReportTemplate({
        name,
        module: moduleKey,
        configuration_json: buildConfigurationObject(),
        is_public: opts.isPublic && cap.canShare,
        is_default: opts.isDefault,
      });
      await queryClient.invalidateQueries({ queryKey: ['customReportTemplates'] });
      await templatesQuery.refetch();
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    }
  };

  const addFormula = () => {
    const k = formulaKey.trim().replace(/\W+/g, '_');
    const lab = formulaLabel.trim() || k;
    const ex = formulaExpr.trim();
    if (!k || !ex) return;
    setUserFormulas((prev) => {
      const next = prev.filter((p) => p.key !== k);
      return [...next, { key: k, label: lab, expression: ex }];
    });
  };

  const removeFormula = (k: string) => {
    setUserFormulas((prev) => prev.filter((p) => p.key !== k));
  };

  if (localOnly) {
    return (
      <div className="p-6 max-w-2xl text-app-text">
        <h1 className="text-xl font-semibold mb-2">{title}</h1>
        <p className="text-sm text-app-muted dark:text-slate-400">
          Custom reports run on the{' '}
          <strong className="text-app-text">PostgreSQL API</strong>{' '}
          back end. Switch to LAN / PostgreSQL login (not offline SQLite) to use the Report Designer.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3 text-app-text print:p-4">
      <header className="flex flex-wrap items-start justify-between gap-2 shrink-0 print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-app-muted mt-1">{subtitle || `${moduleLabel} — universal metadata-driven reporting.`}</p>
          {moduleMeta?.primaryEntity && (
            <p className="text-xs text-app-muted mt-1">
              Primary entity: <span className="font-medium text-app-text">{moduleMeta.primaryEntity}</span>
              {moduleMeta.relatedEntities?.length ? (
                <> · Related: {moduleMeta.relatedEntities.join(', ')}</>
              ) : null}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <label className="text-[10px] font-bold uppercase text-app-muted">Report type</label>
            <select
              className="text-xs rounded-lg border border-app-border bg-app-input px-2 py-1"
              value={reportType}
              onChange={(e) => {
                const next = e.target.value as ReportTypeId;
                setReportType(next);
                if (next === 'grouped' || next === 'summary' || next === 'chart') {
                  if (groupBy.length === 0 && (metaQuery.data?.groupDimensions?.length ?? 0) > 0) {
                    setGroupBy([metaQuery.data!.groupDimensions[0]!]);
                  }
                }
              }}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.enabled}>
                  {t.label}{!t.enabled ? ' (soon)' : ''}
                </option>
              ))}
            </select>
            {modulePickerVisible && (
              <>
                <span className="text-app-border">|</span>
                {(metaQuery.data?.modules ?? CUSTOM_REPORT_MODULES).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      moduleKey === m.key
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-app-border text-app-text'
                    }`}
                    onClick={() => switchModule(m.key as CustomReportModuleKey)}
                  >
                    {m.label}
                  </button>
                ))}
              </>
            )}
          </div>
          {moduleTemplates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] font-bold uppercase text-app-muted">Templates</span>
              {moduleTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={`${t.description} (double-click to favorite)`}
                  className="px-2 py-0.5 rounded-md text-[11px] border border-app-border hover:bg-app-table-hover"
                  onClick={() => applyTemplate(t.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    toggleFavorite(t.id);
                  }}
                >
                  {favorites.includes(t.id) ? '★ ' : ''}{t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={metaQuery.isLoading}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            onClick={() => runMutation.mutate({})}
          >
            Run preview
          </button>
          {cap.canExport && (
            <>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-app-border text-sm"
                onClick={() =>
                  downloadCustomReportExport({
                    body: { ...buildPayload(), format: 'csv', reportName: templateName },
                  })
                }
              >
                CSV
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-app-border text-sm"
                onClick={() =>
                  downloadCustomReportExport({
                    body: { ...buildPayload(), format: 'xlsx', reportName: templateName },
                  })
                }
              >
                Excel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-app-border text-sm"
                onClick={() =>
                  downloadCustomReportExport({
                    body: { ...buildPayload(), format: 'pdf', reportName: templateName },
                  })
                }
              >
                PDF
              </button>
            </>
          )}
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-app-border text-sm"
            disabled={!preview || printLoading}
            onClick={() => void handlePrintReport()}
            title={
              preview && preview.totalCount > CUSTOM_REPORT_MAX_PRINT_ROWS
                ? `Print is limited to ${CUSTOM_REPORT_MAX_PRINT_ROWS.toLocaleString()} rows; larger reports offer PDF export`
                : undefined
            }
          >
            {printLoading
              ? 'Preparing…'
              : preview && preview.totalCount > CUSTOM_REPORT_MAX_PRINT_ROWS
                ? `Print (max ${CUSTOM_REPORT_MAX_PRINT_ROWS.toLocaleString()})`
                : 'Print'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 print:hidden">
        <section className="lg:col-span-3 flex flex-col min-h-0 gap-2">
          <div className="flex flex-col min-h-0 flex-1 border border-app-border rounded-xl bg-app-card">
          <div className="px-3 py-2 border-b border-app-border text-xs font-bold uppercase tracking-wide text-app-muted">
            Available fields — drag to canvas
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {metaQuery.isLoading && <p className="text-sm text-app-muted px-2">Loading…</p>}
            {metaQuery.isError && (
              <p className="text-sm text-red-600 px-2">{(metaQuery.error as Error).message}</p>
            )}
            {grouped.map(([group, fields]) => (
              <details key={group} className="border border-app-border rounded-lg" open>
                <summary className="cursor-pointer px-2 py-1.5 text-sm font-medium bg-app-toolbar">
                  {group}
                </summary>
                <ul className="p-1 space-y-0.5 max-h-48 overflow-y-auto">
                  {fields.map((f) => (
                    <li key={f.key}>
                      <label
                        draggable
                        onDragStart={(e) => handleFieldDragStart(e, f.key)}
                        className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-app-table-hover cursor-grab active:cursor-grabbing"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKeys.includes(f.key)}
                          onChange={() => toggleField(f.key)}
                        />
                        <span className="flex-1">{f.label}</span>
                        {f.kind === 'calculated' && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">fx</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          </div>
          <ReportLibraryPanel
            favorites={libraryQuery.data?.favorites ?? []}
            recent={libraryQuery.data?.recent ?? []}
            saved={libraryQuery.data?.definitions ?? []}
            activeId={activeDefinitionId}
            loading={libraryQuery.isLoading}
            onLoad={(row) => void loadSavedDefinition(row)}
            onFavorite={(id) => void handleToggleFavoriteDefinition(id)}
            onDelete={(id) => void handleDeleteDefinition(id)}
          />
          <ReportSchedulePanel definitionId={activeDefinitionId} definitionName={templateName.trim() || undefined} />
          <ReportSharePanel
            definitionId={activeDefinitionId}
            canManage={Boolean(activeDefinitionId && user?.id && definitionOwnerId === user.id)}
          />
        </section>

        <section
          className="lg:col-span-4 flex flex-col min-h-0 border border-app-border rounded-xl bg-app-card"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleCanvasDrop}
        >
          <div className="px-3 py-2 border-b border-app-border text-xs font-bold uppercase tracking-wide text-app-muted">
            Report canvas — {groupBy.length > 0
              ? `Grouped (${groupBy.length} dimensions)`
              : `${selectedKeys.length} column${selectedKeys.length === 1 ? '' : 's'}`}
          </div>
          <ul className="flex-1 overflow-auto p-2 space-y-1 min-h-[120px]">
            {selectedKeys.length === 0 && (
              <li className="text-xs text-app-muted italic px-2 py-4 text-center border border-dashed border-app-border rounded-lg">
                Drag fields from the left panel or check boxes to build your report layout.
              </li>
            )}
            {selectedKeys.map((k, idx) => {
              const label = columnSettings[k]?.headerLabel
                ?? metaQuery.data?.fields.find((f) => f.key === k)?.label
                ?? k;
              const selected = selectedCanvasKey === k;
              return (
                <li
                  key={k}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCanvasKey(k)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedCanvasKey(k)}
                  className={`flex items-center gap-1 text-sm border rounded-lg px-2 py-1 cursor-pointer ${
                    selected ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border'
                  }`}
                >
                  <span className="flex-1 truncate">{label}</span>
                  <button
                    type="button"
                    className="text-xs px-1 text-app-muted"
                    onClick={() =>
                      setSelectedKeys((prev) => {
                        const n = [...prev];
                        if (idx > 0) [n[idx - 1], n[idx]] = [n[idx]!, n[idx - 1]!];
                        return n;
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-xs px-1 text-app-muted"
                    onClick={() =>
                      setSelectedKeys((prev) => {
                        const n = [...prev];
                        if (idx < n.length - 1) [n[idx + 1], n[idx]] = [n[idx]!, n[idx + 1]!];
                        return n;
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => setSelectedKeys((s) => s.filter((x) => x !== k))}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-app-border p-2 space-y-2">
            <p className="text-xs font-semibold text-app-muted">Grouping & sort</p>
            <div className="flex flex-wrap gap-2">
              <select
                multiple
                aria-label="Group report by dimensions"
                className="flex-1 min-w-[120px] text-xs rounded border border-app-border bg-app-input h-20"
                value={groupBy}
                onChange={(e) => {
                  const v = [...e.target.selectedOptions].map((o) => o.value);
                  setGroupBy(v);
                }}
              >
                {(metaQuery.data?.groupDimensions ?? []).map((g) => (
                  <option key={g} value={g}>
                    {g.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1 text-xs">
                <select
                  aria-label="Sort by field"
                  className="rounded border border-app-border bg-app-input"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                >
                  {groupBy.length > 0
                    ? [
                        ...(metaQuery.data?.groupDimensions ?? []).map((g) => (
                          <option key={g} value={g}>
                            {g.replace(/_/g, ' ')}
                          </option>
                        )),
                        ...(preview?.columns ?? [])
                          .filter((c) => c.key.startsWith('agg_'))
                          .map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label ?? c.key}
                            </option>
                          )),
                      ]
                    : (metaQuery.data?.fields ?? [])
                        .filter((f) => f.sortable)
                        .map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                </select>
                <select
                  aria-label="Sort direction"
                  className="rounded border border-app-border bg-app-input"
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as 'ASC' | 'DESC')}
                >
                  <option value="DESC">DESC</option>
                  <option value="ASC">ASC</option>
                </select>
              </div>
            </div>
            {groupBy.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-app-muted">Aggregates</p>
                  <button
                    type="button"
                    className="text-xs text-indigo-600"
                    onClick={addAggregateRow}
                  >
                    + Add
                  </button>
                </div>
                {aggregates.length === 0 && (
                  <p className="text-[11px] text-app-muted italic">
                    No aggregates — preview uses COUNT by default.
                  </p>
                )}
                {aggregates.map((agg) => (
                  <div
                    key={agg.id}
                    className="grid grid-cols-12 gap-1 text-[11px] border border-app-border rounded-lg p-1"
                  >
                    <select
                      aria-label={`Aggregate field ${agg.id.slice(0, 8)}`}
                      className="col-span-5 rounded border border-app-border bg-app-input"
                      value={agg.field}
                      onChange={(e) =>
                        setAggregates((prev) =>
                          prev.map((x) =>
                            x.id === agg.id ? { ...x, field: e.target.value } : x
                          )
                        )
                      }
                    >
                      {(metaQuery.data?.fields ?? [])
                        .filter((f) => {
                          if (f.kind === 'calculated') return false;
                          if (agg.operation === 'COUNT') return true;
                          return f.aggregatable;
                        })
                        .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Aggregate operation ${agg.id.slice(0, 8)}`}
                      className="col-span-5 rounded border border-app-border bg-app-input"
                      value={agg.operation}
                      onChange={(e) =>
                        setAggregates((prev) =>
                          prev.map((x) =>
                            x.id === agg.id ? { ...x, operation: e.target.value } : x
                          )
                        )
                      }
                    >
                      {(metaQuery.data?.aggregateOperations ?? ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']).map(
                        (op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        )
                      )}
                    </select>
                    <button
                      type="button"
                      className="col-span-2 text-red-600 text-center"
                      onClick={() => setAggregates((prev) => prev.filter((x) => x.id !== agg.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {groupBy.length === 0 && (
          <div className="border-t border-app-border p-2 space-y-2">
            <p className="text-xs font-semibold text-app-muted">Ad-hoc formula</p>
            <input
              className="w-full text-xs rounded border border-app-border bg-app-input px-2 py-1"
              placeholder="column key"
              value={formulaKey}
              onChange={(e) => setFormulaKey(e.target.value)}
            />
            <input
              className="w-full text-xs rounded border border-app-border bg-app-input px-2 py-1"
              placeholder="label"
              value={formulaLabel}
              onChange={(e) => setFormulaLabel(e.target.value)}
            />
            <textarea
              className="w-full text-xs rounded border border-app-border bg-app-input px-2 py-1 font-mono"
              rows={2}
              placeholder="e.g. {selling_price} - {invoice_paid_total}"
              value={formulaExpr}
              onChange={(e) => setFormulaExpr(e.target.value)}
            />
            <button
              type="button"
              className="text-xs px-2 py-1 rounded bg-app-toolbar"
              onClick={addFormula}
            >
              Add formula column
            </button>
            {userFormulas.length > 0 && (
              <ul className="text-xs space-y-1">
                {userFormulas.map((u) => (
                  <li key={u.key} className="flex justify-between gap-2">
                    <span className="truncate font-mono">{u.label}</span>
                    <button type="button" className="text-red-600" onClick={() => removeFormula(u.key)}>
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}
        </section>

        <section className="lg:col-span-5 flex flex-col min-h-0 border border-app-border rounded-xl bg-app-card">
          {selectedCanvasKey && (
            <div className="px-3 py-2 border-b border-app-border space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-app-muted">Field settings</p>
              <input
                className="w-full text-xs rounded border border-app-border bg-app-input px-2 py-1"
                placeholder="Column header label"
                value={columnSettings[selectedCanvasKey]?.headerLabel ?? ''}
                onChange={(e) =>
                  setColumnSettings((prev) => ({
                    ...prev,
                    [selectedCanvasKey]: { ...prev[selectedCanvasKey], headerLabel: e.target.value || undefined },
                  }))
                }
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 text-xs rounded border border-app-border bg-app-input"
                  value={columnSettings[selectedCanvasKey]?.align ?? 'left'}
                  onChange={(e) =>
                    setColumnSettings((prev) => ({
                      ...prev,
                      [selectedCanvasKey]: {
                        ...prev[selectedCanvasKey],
                        align: e.target.value as 'left' | 'center' | 'right',
                      },
                    }))
                  }
                >
                  <option value="left">Align left</option>
                  <option value="center">Align center</option>
                  <option value="right">Align right</option>
                </select>
                <input
                  className="w-20 text-xs rounded border border-app-border bg-app-input px-2"
                  placeholder="Width"
                  value={columnSettings[selectedCanvasKey]?.width ?? ''}
                  onChange={(e) =>
                    setColumnSettings((prev) => ({
                      ...prev,
                      [selectedCanvasKey]: { ...prev[selectedCanvasKey], width: e.target.value || undefined },
                    }))
                  }
                />
              </div>
            </div>
          )}
          <div className="px-3 py-2 border-b border-app-border flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wide text-app-muted">Filter builder</span>
            <button type="button" className="text-xs text-indigo-600" onClick={addFilterRow}>
              + Add
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            <input
              type="search"
              className="w-full text-sm rounded border border-app-border bg-app-input px-2 py-1 mb-2"
              placeholder="Search across searchable columns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filters.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-12 gap-1 text-[11px] border border-app-border rounded-lg p-1"
              >
                <select
                  aria-label={`Filter column for rule ${f.id.slice(0, 8)}`}
                  className="col-span-3 rounded border border-app-border bg-app-input"
                  value={f.field}
                  onChange={(e) =>
                    setFilters((prev) =>
                      prev.map((x) => (x.id === f.id ? { ...x, field: e.target.value } : x))
                    )
                  }
                >
                  {(metaQuery.data?.fields ?? [])
                    .filter((fl) => fl.filterable)
                    .map((fl) => (
                      <option key={fl.key} value={fl.key}>
                        {fl.label}
                      </option>
                    ))}
                </select>
                <select
                  aria-label={`Filter operator for rule ${f.id.slice(0, 8)}`}
                  className="col-span-3 rounded border border-app-border bg-app-input"
                  value={f.operator}
                  onChange={(e) =>
                    setFilters((prev) =>
                      prev.map((x) => (x.id === f.id ? { ...x, operator: e.target.value } : x))
                    )
                  }
                >
                  {(metaQuery.data?.filterOperators ?? []).map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                {f.operator !== 'IS NULL' && f.operator !== 'IS NOT NULL' ? (
                  f.operator === 'BETWEEN' ? (
                    <>
                      <input
                        className="col-span-2 rounded border px-1"
                        placeholder="from"
                        value={f.value}
                        onChange={(e) =>
                          setFilters((p) =>
                            p.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x))
                          )
                        }
                      />
                      <input
                        className="col-span-2 rounded border px-1"
                        placeholder="to"
                        value={f.valueTo ?? ''}
                        onChange={(e) =>
                          setFilters((p) =>
                            p.map((x) =>
                              x.id === f.id ? { ...x, valueTo: e.target.value } : x
                            )
                          )
                        }
                      />
                    </>
                  ) : (
                    <input
                      className="col-span-5 rounded border px-1"
                      placeholder={f.operator === 'IN' ? 'a,b,c' : 'value'}
                      value={f.value}
                      onChange={(e) =>
                        setFilters((p) =>
                          p.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x))
                        )
                      }
                    />
                  )
                ) : (
                  <span className="col-span-6 text-slate-400 italic">no value</span>
                )}
                <button
                  type="button"
                  className="col-span-1 text-red-600 text-center"
                  onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))}
                >
                  ×
                </button>
              </div>
            ))}
            {filters.length === 0 && (
              <p className="text-xs text-app-muted italic px-1">No row filters.</p>
            )}
          </div>
          <div className="border-t border-app-border p-2 space-y-2">
            <input
              className="w-full text-sm rounded border border-app-border bg-app-input px-2 py-1"
              placeholder="Report name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <input
              className="w-full text-xs rounded border border-app-border bg-app-input px-2 py-1"
              placeholder="Description (optional)"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
            />
            <input
              className="w-full text-xs rounded border border-app-border bg-app-input px-2 py-1"
              placeholder="Tags (comma-separated)"
              value={reportTags}
              onChange={(e) => setReportTags(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="flex-1 text-xs rounded border border-app-border bg-app-input px-2 py-1"
                placeholder="Category"
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value)}
              />
              <select
                className="text-xs rounded border border-app-border bg-app-input px-2 py-1"
                value={reportVisibility}
                onChange={(e) => setReportVisibility(e.target.value as ReportVisibility)}
                aria-label="Report visibility"
              >
                <option value="private">Private</option>
                <option value="team">Team</option>
                <option value="company">Company</option>
              </select>
            </div>
            <div className="flex gap-2 flex-wrap">
              {cap.canCreate && (
                <>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-app-toolbar"
                    onClick={() => saveTemplate({ isPublic: false, isDefault: false })}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-slate-800 text-white disabled:opacity-40"
                    disabled={!cap.canShare}
                    onClick={() => saveTemplate({ isPublic: true, isDefault: false })}
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-indigo-500 text-indigo-700 dark:text-indigo-300"
                    onClick={() => saveTemplate({ isPublic: false, isDefault: true })}
                  >
                    Set default (me)
                  </button>
                </>
              )}
            </div>
            {activeDefinitionId && (
              <p className="text-[10px] text-app-muted">Editing saved report — Save updates the existing definition.</p>
            )}
            {activeDefinitionId && (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-app-border"
                onClick={async () => {
                  try {
                    if (isPinnedToDashboard) {
                      await unpinReportFromDashboard(activeDefinitionId);
                    } else {
                      await pinReportToDashboard(activeDefinitionId);
                    }
                    await dashboardPinsQuery.refetch();
                  } catch (e) {
                    setPreviewError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                {isPinnedToDashboard ? 'Unpin from dashboard' : 'Pin to dashboard'}
              </button>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase text-app-muted mb-1">Saved templates</p>
              <ul className="max-h-28 overflow-auto text-xs space-y-1">
                {(templatesQuery.data ?? []).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <button
                      type="button"
                      className="text-left text-indigo-600 dark:text-indigo-400 truncate flex-1"
                      onClick={() => loadTemplateRow(t)}
                    >
                      {t.name}
                      {t.is_default ? ' ★' : ''}
                      {t.is_public ? ' (shared)' : ''}
                    </button>
                    {cap.canCreate && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="text-app-muted"
                          title="Duplicate"
                          onClick={async () => {
                            await saveCustomReportTemplate({
                              name: `${t.name} (copy)`,
                              module: t.module,
                              configuration_json:
                                typeof t.configuration_json === 'object' && t.configuration_json
                                  ? t.configuration_json
                                  : {},
                            });
                            queryClient.invalidateQueries({ queryKey: ['customReportTemplates'] });
                          }}
                        >
                          Dup
                        </button>
                        <button
                          type="button"
                          className="text-red-600"
                          title="Delete"
                          onClick={async () => {
                            if (
                              !window.confirm(`Delete saved report template "${t.name}"?`)
                            ) {
                              return;
                            }
                            await deleteCustomReportTemplate(t.id);
                            queryClient.invalidateQueries({ queryKey: ['customReportTemplates'] });
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {templatesQuery.data?.length === 0 && (
                <p className="text-[11px] text-app-muted">No templates yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {(previewError || runMutation.error) && (
        <div className="text-sm text-red-600 border border-red-200 rounded-lg px-3 py-2 shrink-0 print:hidden">
          {previewError ??
            String((runMutation.error as Error)?.message ?? runMutation.status)}
        </div>
      )}

      <section
        id="custom-report-print-area"
        className={`flex-1 flex flex-col min-h-0 border border-app-border rounded-xl overflow-hidden bg-app-card${printSnapshot ? ' print-snapshot-active' : ''}`}
        data-print-scroll-container
      >
        <div className="px-3 py-2 border-b border-app-border text-xs font-bold uppercase tracking-wide text-app-muted flex justify-between no-print">
          <span>
            Preview
            {preview && (
              <>
                {' '}
                ({preview.rows.length} of {preview.totalCount})
              </>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="font-normal disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => {
                const n = Math.max(1, page - 1);
                setPage(n);
                runMutation.mutate({ page: n });
              }}
            >
              Prev
            </button>
            <button
              type="button"
              className="font-normal disabled:opacity-40"
              disabled={preview ? page * pageSize >= preview.totalCount : true}
              onClick={() => {
                const n = page + 1;
                setPage(n);
                runMutation.mutate({ page: n });
              }}
            >
              Next
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin min-h-[200px] bg-app-card border border-app-border rounded-lg px-3 py-2">
          <ReportHeader reportTitle={templateName || 'Custom Report'} />
          {(printSnapshot ?? preview) && (
            <p className="text-center text-xs text-app-muted mb-2 report-title-block">
              {(printSnapshot ?? preview)!.totalCount} row{(printSnapshot ?? preview)!.totalCount === 1 ? '' : 's'}
              {printSnapshot && printSnapshot.rows.length < preview!.totalCount
                ? ` (print capped at ${printSnapshot.rows.length.toLocaleString()} rows; use PDF export for full export)`
                : preview && preview.rows.length < preview.totalCount
                  ? ` — screen shows page ${page}; print loads all filtered rows (up to 5,000)`
                  : ''}
            </p>
          )}
          {runMutation.isPending && (
            <p className="p-4 text-sm text-app-muted no-print">Running query…</p>
          )}
          {!runMutation.isPending && preview && reportType === 'chart' && (
            <div className="p-3 no-print">
              <ReportChartPreview preview={preview} />
            </div>
          )}
          {!runMutation.isPending && preview && (
            <table key={previewTableMountKey} className="min-w-full text-[11px] border-collapse no-print">
              <thead className="sticky top-0 z-10 bg-app-table-header shadow-sm">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left px-2 py-1.5 border-b border-app-border font-semibold whitespace-nowrap"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-app-border hover:bg-app-table-hover"
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1 whitespace-nowrap align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(printSnapshot ?? preview) && (
            <table className="min-w-full text-[11px] border-collapse report-print-table">
              <thead className="bg-app-table-header">
                {printTable.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left px-2 py-1.5 border-b border-slate-300 font-semibold"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {printTable.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!preview && !runMutation.isPending && (
            <p className="p-6 text-sm text-app-muted italic no-print">
              Run preview to fetch rows from PostgreSQL via the audited query engine.
            </p>
          )}
          <ReportFooter />
        </div>
      </section>
    </div>
  );
};

export default CustomReportBuilderPage;
