/**
 * Dynamic Custom Report Builder — Project Selling (PostgreSQL / API session).
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
import { isLocalOnlyMode } from '../../../config/apiUrl';
import {
  CUSTOM_REPORT_MODULE_PROJECT_SELLING,
  CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS,
  CUSTOM_REPORT_MODULES,
  fetchCustomReportMetadata,
  generateCustomReport,
  fetchCustomReportTemplates,
  saveCustomReportTemplate,
  deleteCustomReportTemplate,
  downloadCustomReportExport,
  type CustomReportFieldMeta,
  type CustomReportModuleKey,
  type GeneratedReportResponse,
  type CustomReportTemplateApiRow,
} from '../../../services/api/customReportsApi';

const PROJECT_SELLING_DEFAULT_KEYS = [
  'booking_no',
  'customer_name',
  'project_name',
  'selling_price',
  'invoice_paid_total',
  'outstanding_vs_invoices',
];

const RENTAL_DEFAULT_KEYS = [
  'agreement_number',
  'tenant_name',
  'property_name',
  'building_name',
  'monthly_rent',
  'status',
  'start_date',
  'end_date',
];

function defaultCountFieldKey(
  fields: CustomReportFieldMeta[],
  moduleKey: CustomReportModuleKey
): string {
  const nonCalculated = fields.filter((f) => f.kind !== 'calculated');
  const fallback =
    moduleKey === CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS ? 'agreement_number' : 'booking_no';
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

export const CustomReportBuilderPage: React.FC = () => {
  const { user } = useAuth();
  const cap = backendReportCapability(user?.role);

  const [moduleKey, setModuleKey] = useState<CustomReportModuleKey>(
    CUSTOM_REPORT_MODULE_PROJECT_SELLING
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>(PROJECT_SELLING_DEFAULT_KEYS);
  const [filters, setFilters] = useState<BuilderFilterRow[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<BuilderAggregateRow[]>([]);
  const [sortField, setSortField] = useState('booking_date');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [templateName, setTemplateName] = useState('');
  const [formulaExpr, setFormulaExpr] = useState('');
  const [formulaKey, setFormulaKey] = useState('pct_sample');
  const [formulaLabel, setFormulaLabel] = useState('Sample % calc');
  const [userFormulas, setUserFormulas] = useState<{ key: string; label: string; expression: string }[]>(
    []
  );

  const [preview, setPreview] = useState<GeneratedReportResponse | null>(null);
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

  const queryClient = useQueryClient();

  const grouped = useMemo(
    () => groupFieldsByEntity(metaQuery.data?.fields ?? []),
    [metaQuery.data?.fields]
  );

  const buildPayload = useCallback(() => {
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
    return base;
  }, [
    moduleKey,
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
  ]);

  const runMutation = useMutation({
    mutationFn: (override: Record<string, unknown> = {}) =>
      generateCustomReport({
        ...buildPayload(),
        ...override,
      }),
    onSuccess: (data) => {
      setPreview(data);
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

  /** Stable key so dynamic column sets remount after each successful preview (avoids stale column-visibility / cell maps). */
  const previewTableMountKey = preview
    ? `${preview.columns.map((c) => c.key).join('|')}::${preview.rows.length}::p${page}`
    : 'empty';

  const switchModule = (next: CustomReportModuleKey) => {
    if (next === moduleKey) return;
    setModuleKey(next);
    setSelectedKeys(
      next === CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS
        ? RENTAL_DEFAULT_KEYS
        : PROJECT_SELLING_DEFAULT_KEYS
    );
    setSortField(next === CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS ? 'start_date' : 'booking_date');
    setGroupBy([]);
    setAggregates([]);
    setFilters([]);
    setUserFormulas([]);
    setPreview(null);
    setPreviewError(null);
    setPage(1);
    setTemplateName('');
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

  const toggleField = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const addFilterRow = () => {
    const first = metaQuery.data?.fields.find((f) => f.filterable)?.key ?? 'booking_no';
    setFilters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), field: first, operator: '=', value: '' },
    ]);
  };

  const loadTemplateRow = async (row: CustomReportTemplateApiRow) => {
    const cfg = row.configuration_json ?? {};
    if (row.module) {
      setModuleKey(row.module as CustomReportModuleKey);
    }
    if (typeof cfg.fields === 'object' && Array.isArray(cfg.fields)) {
      setSelectedKeys(cfg.fields as string[]);
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
    setTemplateName(row.name);
    setPage(1);
    runMutation.mutate({ page: 1 });
  };

  const saveTemplate = async (opts: { isPublic: boolean; isDefault: boolean }) => {
    if (!cap.canCreate) return;
    const name = templateName.trim() || 'Untitled report';
    await saveCustomReportTemplate({
      name,
      module: moduleKey,
      configuration_json: {
        fields: selectedKeys,
        filters: filters.map(({ field, operator, value, valueTo }) => {
          const o: Record<string, unknown> = { field, operator };
          if (operator === 'IN') o.value = value.split(',').map((s) => s.trim());
          else if (operator === 'BETWEEN') {
            o.value = value;
            o.valueTo = valueTo;
          } else if (operator !== 'IS NULL' && operator !== 'IS NOT NULL') {
            o.value = value;
          }
          return o;
        }),
        groupBy,
        aggregates: aggregates.map(({ field, operation }) => ({ field, operation })),
        sortBy: [{ field: sortField, direction: sortDir }],
        formulas: userFormulas,
      },
      is_public: opts.isPublic && cap.canShare,
      is_default: opts.isDefault,
    });
    await queryClient.invalidateQueries({ queryKey: ['customReportTemplates'] });
    await templatesQuery.refetch();
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
      <div className="p-6 max-w-2xl text-slate-700 dark:text-slate-200">
        <h1 className="text-xl font-semibold mb-2">Custom Report Builder</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This feature runs on the{' '}
          <strong className="text-slate-800 dark:text-slate-100">PostgreSQL API</strong>{' '}
          back end. Switch to LAN / PostgreSQL login (not offline SQLite) to build and run
          custom reports for project selling and rental agreements.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3 text-slate-800 dark:text-slate-100 print:p-4">
      <header className="flex flex-wrap items-start justify-between gap-2 shrink-0 print:hidden">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Custom Report Builder</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {moduleLabel} — metadata-driven queries (no raw SQL).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(metaQuery.data?.modules ?? CUSTOM_REPORT_MODULES).map((m) => (
              <button
                key={m.key}
                type="button"
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  moduleKey === m.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                }`}
                onClick={() => switchModule(m.key as CustomReportModuleKey)}
              >
                {m.label}
              </button>
            ))}
          </div>
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
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
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
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
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
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
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
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 print:hidden">
        <section className="lg:col-span-3 flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/40">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wide text-slate-500">
            Available fields
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {metaQuery.isLoading && <p className="text-sm text-slate-500 px-2">Loading…</p>}
            {metaQuery.isError && (
              <p className="text-sm text-red-600 px-2">{(metaQuery.error as Error).message}</p>
            )}
            {grouped.map(([group, fields]) => (
              <details key={group} className="border border-slate-100 dark:border-slate-800 rounded-lg" open>
                <summary className="cursor-pointer px-2 py-1.5 text-sm font-medium bg-slate-50 dark:bg-slate-800/80">
                  {group}
                </summary>
                <ul className="p-1 space-y-0.5 max-h-48 overflow-y-auto">
                  {fields.map((f) => (
                    <li key={f.key}>
                      <label className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800">
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
        </section>

        <section className="lg:col-span-4 flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/40">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wide text-slate-500">
            {groupBy.length > 0
              ? `Group dimensions preview (${groupBy.length} selected)`
              : `Selected columns (${selectedKeys.length})`}
          </div>
          <ul className="flex-1 overflow-auto p-2 space-y-1">
            {selectedKeys.map((k, idx) => {
              const label = metaQuery.data?.fields.find((f) => f.key === k)?.label ?? k;
              return (
                <li
                  key={k}
                  className="flex items-center gap-1 text-sm border border-slate-100 dark:border-slate-800 rounded-lg px-2 py-1"
                >
                  <span className="flex-1 truncate">{label}</span>
                  <button
                    type="button"
                    className="text-xs px-1 text-slate-500"
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
                    className="text-xs px-1 text-slate-500"
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
          <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-2">
            <p className="text-xs font-semibold text-slate-500">Grouping & sort</p>
            <div className="flex flex-wrap gap-2">
              <select
                multiple
                aria-label="Group report by dimensions"
                className="flex-1 min-w-[120px] text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 h-20"
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
                  className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
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
                  className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
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
                  <p className="text-xs font-semibold text-slate-500">Aggregates</p>
                  <button
                    type="button"
                    className="text-xs text-indigo-600"
                    onClick={addAggregateRow}
                  >
                    + Add
                  </button>
                </div>
                {aggregates.length === 0 && (
                  <p className="text-[11px] text-slate-500 italic">
                    No aggregates — preview uses COUNT by default.
                  </p>
                )}
                {aggregates.map((agg) => (
                  <div
                    key={agg.id}
                    className="grid grid-cols-12 gap-1 text-[11px] border border-slate-100 dark:border-slate-800 rounded-lg p-1"
                  >
                    <select
                      aria-label={`Aggregate field ${agg.id.slice(0, 8)}`}
                      className="col-span-5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
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
                      className="col-span-5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
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
          <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-2">
            <p className="text-xs font-semibold text-slate-500">Ad-hoc formula</p>
            <input
              className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1"
              placeholder="column key"
              value={formulaKey}
              onChange={(e) => setFormulaKey(e.target.value)}
            />
            <input
              className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1"
              placeholder="label"
              value={formulaLabel}
              onChange={(e) => setFormulaLabel(e.target.value)}
            />
            <textarea
              className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 font-mono"
              rows={2}
              placeholder="e.g. {selling_price} - {invoice_paid_total}"
              value={formulaExpr}
              onChange={(e) => setFormulaExpr(e.target.value)}
            />
            <button
              type="button"
              className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700"
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

        <section className="lg:col-span-5 flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/40">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filters</span>
            <button type="button" className="text-xs text-indigo-600" onClick={addFilterRow}>
              + Add
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            <input
              type="search"
              className="w-full text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 mb-2"
              placeholder="Search across searchable columns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filters.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-12 gap-1 text-[11px] border border-slate-100 dark:border-slate-800 rounded-lg p-1"
              >
                <select
                  aria-label={`Filter column for rule ${f.id.slice(0, 8)}`}
                  className="col-span-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
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
                  className="col-span-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
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
              <p className="text-xs text-slate-500 italic px-1">No row filters.</p>
            )}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-2">
            <div className="flex gap-2">
              <input
                className="flex-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1"
                placeholder="Report / template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              {cap.canCreate && (
                <>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700"
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
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Saved templates</p>
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
                          className="text-slate-500"
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
                <p className="text-[11px] text-slate-500">No templates yet.</p>
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

      <section className="flex-1 flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900/60">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wide text-slate-500 flex justify-between print:hidden">
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
        <div className="flex-1 overflow-auto scrollbar-thin min-h-[200px]" id="custom-report-print-area">
          {runMutation.isPending && (
            <p className="p-4 text-sm text-slate-500 print:hidden">Running query…</p>
          )}
          {!runMutation.isPending && preview && (
            <table key={previewTableMountKey} className="min-w-full text-[11px] border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-sm">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left px-2 py-1.5 border-b border-slate-300 dark:border-slate-600 font-semibold whitespace-nowrap"
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
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
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
          {!preview && !runMutation.isPending && (
            <p className="p-6 text-sm text-slate-500 italic print:hidden">
              Run preview to fetch rows from PostgreSQL via the audited query engine.
            </p>
          )}
        </div>
      </section>
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default CustomReportBuilderPage;
