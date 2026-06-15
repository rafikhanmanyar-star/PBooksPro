import React, { useCallback, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useBuildings, useContacts, useProperties, useRentalAgreements } from '../../hooks/useSelectiveState';
import { ContactType, RentalAgreementStatus } from '../../types';
import { usePrintReport } from '../../hooks/usePrintReport';
import { exportJsonToExcel } from '../../services/exportService';
import { downloadCustomReportExport, CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS } from '../../services/api/customReportsApi';
import ReportHeader from '../../components/reports/ReportHeader';
import ReportFooter from '../../components/reports/ReportFooter';
import { ReportingKpiStrip } from '../reporting-center/components/ReportingKpiStrip';
import { AgingWidget } from '../reporting-center/components/AgingWidget';
import { ReportingActionsBar } from '../reporting-center/components/ReportingActionsBar';
import { useRentalReportingFiltersStore } from './store/rentalReportingFiltersStore';
import { useRentalReportTab, useRentalReportingSummary } from './hooks/useRentalReporting';
import { RentalReportTabPanel } from './components/RentalReportTabPanel';
import { Tenant360Drawer } from './components/Tenant360Drawer';
import type { RentalReportTab } from '../../types/rentalReporting.types';

const TABS: { id: RentalReportTab; label: string }[] = [
  { id: 'ledger', label: 'Tenant Ledger' },
  { id: 'receivable', label: 'Receivable Report' },
  { id: 'defaulters', label: 'Defaulters Report' },
  { id: 'schedule', label: 'Rent Schedule' },
  { id: 'collection-performance', label: 'Collection Performance' },
];

const QUICK_REPORTS = [
  'Tenant Statement',
  'Tenant Balance Report',
  'Tenant Ledger',
  'Receivable Aging',
  'Defaulters Report',
  'Rent Due Report',
  'Collection Report',
  'Building Wise Receivable',
  'Owner Collection Report',
];

const RentalReportingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { showToast, showAlert } = useNotification();
    const printReport = usePrintReport();

  const filters = useRentalReportingFiltersStore((s) => s.filters);
  const activeTab = useRentalReportingFiltersStore((s) => s.activeTab);
  const generated = useRentalReportingFiltersStore((s) => s.generated);
  const setFilter = useRentalReportingFiltersStore((s) => s.setFilter);
  const setActiveTab = useRentalReportingFiltersStore((s) => s.setActiveTab);
  const setGenerated = useRentalReportingFiltersStore((s) => s.setGenerated);

  const buildings = useBuildings();
  const properties = useProperties();
  const contacts = useContacts();
  const agreements = useRentalAgreements();

  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const enabled = isAuthenticated && generated;
  const summaryQuery = useRentalReportingSummary(filters, enabled);
  const tabQuery = useRentalReportTab(activeTab, filters, page, pageSize, enabled);

  const tenants = useMemo(
    () => contacts.filter((c) => c.type === ContactType.TENANT).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [contacts]
  );
  const owners = useMemo(() => {
    const ids = new Set(agreements.map((a) => a.ownerId).filter(Boolean) as string[]);
    return contacts.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  }, [agreements, contacts]);
  const brokers = useMemo(() => {
    const ids = new Set(agreements.map((a) => a.brokerId).filter(Boolean) as string[]);
    return contacts.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  }, [agreements, contacts]);

  const propertyOptions = useMemo(() => {
    let list = properties;
    if (filters.buildingId) list = list.filter((p) => p.buildingId === filters.buildingId);
    return list.map((p) => ({ id: p.id, name: p.name }));
  }, [properties, filters.buildingId]);

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
    setPage(1);
    setGenerated(true);
  }, [setGenerated, showAlert]);

  const handleQuickReport = useCallback(async (label: string) => {
    const tabMap: Record<string, RentalReportTab> = {
      'Tenant Ledger': 'ledger', 'Receivable Aging': 'receivable', 'Defaulters Report': 'defaulters',
      'Rent Due Report': 'schedule', 'Collection Report': 'collection-performance',
    };
    if (tabMap[label]) setActiveTab(tabMap[label]);
    setGenerated(true);
    if (label !== 'Tenant Ledger') {
      try {
        await downloadCustomReportExport({
          body: {
            module: CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS,
            selectedKeys: ['tenant_name', 'property_name', 'building_name', 'monthly_rent', 'invoice_paid_total', 'outstanding_vs_invoices'],
            sort: { field: 'tenant_name', direction: 'ASC' },
            page: 1, pageSize: 500, exportFormat: 'xlsx',
          },
          defaultFileName: 'rental-quick-report.xlsx',
        });
        showToast(`Exported ${label}`, 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Export failed', 'error');
      }
    }
  }, [setActiveTab, setGenerated, showToast]);

  const handleExportExcel = useCallback(() => {
    if (!tabRows.length) { showToast('Generate a report first', 'warning'); return; }
    exportJsonToExcel(tabRows, `rental-report-${activeTab}.xlsx`, activeTab);
    showToast('Excel exported', 'success');
  }, [activeTab, showToast, tabRows]);

  const handlePrint = useCallback(() => printReport({ elementId: 'rental-report-print' }), [printReport]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4">
      <div className="no-print">
        <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" /> Tenant Reporting Center
        </h2>
        <p className="text-sm text-app-muted mt-1">Rental receivables, tenant ledgers, defaulters, and collection performance.</p>
      </div>

      <div className="rounded-xl border border-app-border bg-app-card p-3 space-y-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.buildingId ?? ''} onChange={(e) => setFilter('buildingId', e.target.value || undefined)} className={selectClass}>
            <option value="">All buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.propertyId ?? ''} onChange={(e) => setFilter('propertyId', e.target.value || undefined)} className={selectClass}>
            <option value="">All properties</option>
            {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.tenantId ?? ''} onChange={(e) => setFilter('tenantId', e.target.value || undefined)} className={selectClass}>
            <option value="">All tenants</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value || undefined)} className={selectClass}>
            <option value="">All statuses</option>
            {Object.values(RentalAgreementStatus).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={selectClass} />
          <span className="text-app-muted text-xs">to</span>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={selectClass} />
          <select value={filters.ownerId ?? ''} onChange={(e) => setFilter('ownerId', e.target.value || undefined)} className={selectClass}>
            <option value="">All owners</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={filters.brokerId ?? ''} onChange={(e) => setFilter('brokerId', e.target.value || undefined)} className={selectClass}>
            <option value="">All brokers</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <ReportingActionsBar
          onGenerate={handleGenerate}
          onExportPdf={handlePrint}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          loading={summaryQuery.isFetching}
          quickReportLabels={QUICK_REPORTS}
          onQuickReport={handleQuickReport}
        />
      </div>

      {generated && (
        <>
          <div className="no-print space-y-4">
            <ReportingKpiStrip kpis={summaryQuery.data?.kpis} loading={summaryQuery.isLoading} />
            <AgingWidget aging={summaryQuery.data?.aging} loading={summaryQuery.isLoading} entityColumnLabel="Tenants" />
          </div>
          <div className="no-print border-b border-app-border flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => { setActiveTab(t.id); setPage(1); }}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 ${activeTab === t.id ? 'border-primary text-primary bg-app-highlight' : 'border-transparent text-app-muted'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <RentalReportTabPanel tab={activeTab} rows={tabRows} loading={tabQuery.isLoading} totalCount={tabTotalCount} page={page} pageSize={pageSize} onPageChange={setPage} onRowClick={setDrawerId} />
        </>
      )}

      {!generated && (
        <div className="flex-1 flex items-center justify-center text-app-muted text-sm no-print">Set filters and click Generate.</div>
      )}

      <div id="rental-report-print" className="hidden print:block p-4">
        <ReportHeader reportTitle="Tenant Reporting Center" />
        <ReportingKpiStrip kpis={summaryQuery.data?.kpis} />
        <AgingWidget aging={summaryQuery.data?.aging} entityColumnLabel="Tenants" />
        <ReportFooter />
      </div>

      <Tenant360Drawer contactId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
};

export default RentalReportingPage;
