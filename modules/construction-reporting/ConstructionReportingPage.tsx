import React, { useCallback, useMemo, useState } from 'react';
import { HardHat } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useContracts, useProjects, useVendors } from '../../hooks/useSelectiveState';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePrintReport } from '../../hooks/usePrintReport';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from '../../components/reports/ReportHeader';
import ReportFooter from '../../components/reports/ReportFooter';
import { ReportingKpiStrip } from '../reporting-center/components/ReportingKpiStrip';
import { AgingWidget } from '../reporting-center/components/AgingWidget';
import { ReportingActionsBar } from '../reporting-center/components/ReportingActionsBar';
import { useConstructionReportingFiltersStore } from './store/constructionReportingFiltersStore';
import { useConstructionReportTab, useConstructionReportingSummary } from './hooks/useConstructionReporting';
import { ConstructionReportTabPanel } from './components/ConstructionReportTabPanel';
import { Vendor360Drawer } from './components/Vendor360Drawer';
import type { ConstructionReportTab } from '../../types/constructionReporting.types';

const TABS: { id: ConstructionReportTab; label: string }[] = [
  { id: 'ledger', label: 'Vendor Ledger' },
  { id: 'payable', label: 'Payable Report' },
  { id: 'overdue', label: 'Overdue Vendors' },
  { id: 'schedule', label: 'Bill Schedule' },
  { id: 'payment-performance', label: 'Payment Performance' },
];

const QUICK_REPORTS = [
  'Vendor Statement',
  'Vendor Balance Report',
  'Vendor Ledger',
  'Payable Aging',
  'Overdue Vendors',
  'Bill Due Report',
  'Payment Report',
  'Project Wise Payable',
  'Contract Payable Report',
];

const ConstructionReportingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { showToast, showAlert } = useNotification();
  const localOnly = isLocalOnlyMode();
  const printReport = usePrintReport();

  const filters = useConstructionReportingFiltersStore((s) => s.filters);
  const activeTab = useConstructionReportingFiltersStore((s) => s.activeTab);
  const generated = useConstructionReportingFiltersStore((s) => s.generated);
  const setFilter = useConstructionReportingFiltersStore((s) => s.setFilter);
  const setActiveTab = useConstructionReportingFiltersStore((s) => s.setActiveTab);
  const setGenerated = useConstructionReportingFiltersStore((s) => s.setGenerated);

  const projects = useProjects();
  const vendors = useVendors();
  const contracts = useContracts();

  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const enabled = isAuthenticated && !localOnly && generated;
  const summaryQuery = useConstructionReportingSummary(filters, enabled);
  const tabQuery = useConstructionReportTab(activeTab, filters, page, pageSize, enabled);

  const contractOptions = useMemo(() => {
    let list = contracts;
    if (filters.projectId) list = list.filter((c) => c.projectId === filters.projectId);
    if (filters.vendorId) list = list.filter((c) => c.vendorId === filters.vendorId);
    return list.map((c) => ({ id: c.id, name: c.name }));
  }, [contracts, filters.projectId, filters.vendorId]);

  const statusOptions = useMemo(() => {
    const set = new Set(contracts.map((c) => c.status).filter(Boolean));
    return [...set].sort();
  }, [contracts]);

  const tabRows = useMemo(() => {
    const d = tabQuery.data;
    if (!d || !('rows' in d)) return [];
    return d.rows as Record<string, unknown>[];
  }, [tabQuery.data]);

  const tabTotalCount = useMemo(() => {
    const d = tabQuery.data;
    if (!d) return 0;
    if ('totalCount' in d) return d.totalCount;
    if ('rows' in d) return (d.rows as unknown[]).length;
    return 0;
  }, [tabQuery.data]);

  const selectClass = 'text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text max-w-[160px]';

  const handleGenerate = useCallback(() => {
    if (localOnly) {
      void showAlert('Vendor Reporting Center requires LAN/API mode.', { title: 'API mode required' });
      return;
    }
    setPage(1);
    setGenerated(true);
  }, [localOnly, setGenerated, showAlert]);

  const handleQuickReport = useCallback((label: string) => {
    const tabMap: Record<string, ConstructionReportTab> = {
      'Vendor Ledger': 'ledger', 'Payable Aging': 'payable', 'Overdue Vendors': 'overdue',
      'Bill Due Report': 'schedule', 'Payment Report': 'payment-performance',
    };
    if (tabMap[label]) setActiveTab(tabMap[label]);
    setGenerated(true);
    showToast(`Opened ${label}`, 'success');
  }, [setActiveTab, setGenerated, showToast]);

  const handleExportExcel = useCallback(() => {
    if (!tabRows.length) { showToast('Generate a report first', 'warning'); return; }
    exportJsonToExcel(tabRows, `construction-report-${activeTab}.xlsx`, activeTab);
    showToast('Excel exported', 'success');
  }, [activeTab, showToast, tabRows]);

  const handlePrint = useCallback(() => printReport({ elementId: 'construction-report-print' }), [printReport]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4">
      <div className="no-print">
        <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
          <HardHat className="w-6 h-6 text-primary" /> Vendor Reporting Center
        </h2>
        <p className="text-sm text-app-muted mt-1">Construction payables, vendor ledgers, overdue bills, and payment performance.</p>
      </div>

      <div className="rounded-xl border border-app-border bg-app-card p-3 space-y-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.projectId ?? ''} onChange={(e) => setFilter('projectId', e.target.value || undefined)} className={selectClass}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.vendorId ?? ''} onChange={(e) => setFilter('vendorId', e.target.value || undefined)} className={selectClass}>
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={filters.contractId ?? ''} onChange={(e) => setFilter('contractId', e.target.value || undefined)} className={selectClass}>
            <option value="">All contracts</option>
            {contractOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value || undefined)} className={selectClass}>
            <option value="">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={selectClass} />
          <span className="text-app-muted text-xs">to</span>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={selectClass} />
        </div>
        <ReportingActionsBar onGenerate={handleGenerate} onExportPdf={handlePrint} onExportExcel={handleExportExcel} onPrint={handlePrint} loading={summaryQuery.isFetching} quickReportLabels={QUICK_REPORTS} onQuickReport={handleQuickReport} />
      </div>

      {localOnly && <div className="rounded-xl border border-ds-warning/30 bg-app-highlight p-3 text-sm no-print">Connect to the API server for full Vendor Reporting Center features.</div>}

      {generated && !localOnly && (
        <>
          <div className="no-print space-y-4">
            <ReportingKpiStrip kpis={summaryQuery.data?.kpis} loading={summaryQuery.isLoading} />
            <AgingWidget aging={summaryQuery.data?.aging} loading={summaryQuery.isLoading} entityColumnLabel="Vendors" />
          </div>
          <div className="no-print border-b border-app-border flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => { setActiveTab(t.id); setPage(1); }}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 ${activeTab === t.id ? 'border-primary text-primary bg-app-highlight' : 'border-transparent text-app-muted'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <ConstructionReportTabPanel tab={activeTab} rows={tabRows} loading={tabQuery.isLoading} totalCount={tabTotalCount} page={page} pageSize={pageSize} onPageChange={setPage} onRowClick={setDrawerId} />
        </>
      )}

      {!generated && <div className="flex-1 flex items-center justify-center text-app-muted text-sm no-print">Set filters and click Generate.</div>}

      <div id="construction-report-print" className="hidden print:block p-4">
        <ReportHeader reportTitle="Vendor Reporting Center" />
        <ReportingKpiStrip kpis={summaryQuery.data?.kpis} />
        <AgingWidget aging={summaryQuery.data?.aging} entityColumnLabel="Vendors" />
        <ReportFooter />
      </div>

      <Vendor360Drawer vendorId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
};

export default ConstructionReportingPage;
