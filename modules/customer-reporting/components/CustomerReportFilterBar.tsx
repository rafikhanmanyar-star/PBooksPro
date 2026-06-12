import React from 'react';
import { ChevronDown, FileDown, FileSpreadsheet, Play, Printer } from 'lucide-react';
import Button from '../../../components/ui/Button';
import type { CustomerReportingFilters } from '../../../types/customerReporting.types';
import { ProjectAgreementStatus } from '../../../types';

export interface FilterOption {
  id: string;
  name: string;
}

export interface CustomerReportFilterBarProps {
  filters: CustomerReportingFilters;
  projects: FilterOption[];
  customers: FilterOption[];
  units: FilterOption[];
  salesAgents: FilterOption[];
  onFilterChange: <K extends keyof CustomerReportingFilters>(key: K, value: CustomerReportingFilters[K]) => void;
  onGenerate: () => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  quickReportsSlot?: React.ReactNode;
  loading?: boolean;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.values(ProjectAgreementStatus).map((s) => ({ value: s, label: s })),
];

export const CustomerReportFilterBar: React.FC<CustomerReportFilterBarProps> = ({
  filters,
  projects,
  customers,
  units,
  salesAgents,
  onFilterChange,
  onGenerate,
  onExportPdf,
  onExportExcel,
  onPrint,
  quickReportsSlot,
  loading,
}) => {
  const selectClass =
    'text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text max-w-[160px] min-w-0';

  return (
    <div className="rounded-xl border border-app-border bg-app-card p-3 space-y-3 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.projectId ?? ''}
          onChange={(e) => onFilterChange('projectId', e.target.value || undefined)}
          className={selectClass}
          aria-label="Project"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={filters.customerId ?? ''}
          onChange={(e) => onFilterChange('customerId', e.target.value || undefined)}
          className={selectClass}
          aria-label="Customer"
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filters.unitId ?? ''}
          onChange={(e) => onFilterChange('unitId', e.target.value || undefined)}
          className={selectClass}
          aria-label="Unit"
        >
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <select
          value={filters.status ?? ''}
          onChange={(e) => onFilterChange('status', e.target.value || undefined)}
          className={selectClass}
          aria-label="Status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.from}
          onChange={(e) => onFilterChange('from', e.target.value)}
          className={selectClass}
          aria-label="From date"
        />
        <span className="text-app-muted text-xs">to</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => onFilterChange('to', e.target.value)}
          className={selectClass}
          aria-label="To date"
        />

        <select
          value={filters.salesAgentId ?? ''}
          onChange={(e) => onFilterChange('salesAgentId', e.target.value || undefined)}
          className={selectClass}
          aria-label="Sales agent"
        >
          <option value="">All agents</option>
          {salesAgents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onGenerate} className="text-xs gap-1.5" disabled={loading}>
            <Play className="w-3.5 h-3.5" />
            Generate
          </Button>
          <Button variant="secondary" onClick={onExportPdf} className="text-xs gap-1.5">
            <FileDown className="w-3.5 h-3.5" />
            Export PDF
          </Button>
          <Button variant="secondary" onClick={onExportExcel} className="text-xs gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel
          </Button>
          <Button variant="secondary" onClick={onPrint} className="text-xs gap-1.5">
            <Printer className="w-3.5 h-3.5" />
            Print Preview
          </Button>
        </div>
        {quickReportsSlot}
      </div>
    </div>
  );
};

export const QuickReportsMenu: React.FC<{
  onSelect: (key: string) => void;
}> = ({ onSelect }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} className="text-xs gap-1">
        Quick Reports
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-lg border border-app-border bg-app-card shadow-lg py-1 max-h-72 overflow-y-auto">
          {[
            'Customer Statement',
            'Customer Balance Report',
            'Customer Ledger',
            'Receivable Aging',
            'Defaulters Report',
            'Installment Due Report',
            'Collection Report',
            'Project Wise Receivable',
            'Sales Agent Collection Report',
          ].map((label) => (
            <button
              key={label}
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-app-text hover:bg-app-table-hover"
              onClick={() => {
                onSelect(label);
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
