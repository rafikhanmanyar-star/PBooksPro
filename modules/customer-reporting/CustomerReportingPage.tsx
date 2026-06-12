import React, { useCallback, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import {
  useContacts,
  useProjects,
  useProjectAgreements,
  useUnits,
} from '../../hooks/useSelectiveState';
import { ContactType } from '../../types';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePrintReport } from '../../hooks/usePrintReport';
import { exportJsonToExcel } from '../../services/exportService';
import { downloadCustomReportExport } from '../../services/api/customReportsApi';
import ReportHeader from '../../components/reports/ReportHeader';
import ReportFooter from '../../components/reports/ReportFooter';
import { CustomerReportFilterBar, QuickReportsMenu } from './components/CustomerReportFilterBar';
import { CustomerReportKpiStrip } from './components/CustomerReportKpiStrip';
import { CustomerAgingWidget } from './components/CustomerAgingWidget';
import { CustomerReportTabPanel } from './components/CustomerReportTabPanel';
import { Customer360Drawer } from './components/Customer360Drawer';
import { useCustomerReportingFiltersStore } from './store/customerReportingFiltersStore';
import { useCustomerReportTab, useCustomerReportingSummary } from './hooks/useCustomerReporting';
import {
  QUICK_REPORT_PRESETS,
  buildCustomReportPayload,
} from './config/quickReportPresets';
import type { CustomerReportTab } from '../../types/customerReporting.types';

const TABS: { id: CustomerReportTab; label: string }[] = [
  { id: 'ledger', label: 'Customer Ledger' },
  { id: 'receivable', label: 'Receivable Report' },
  { id: 'defaulters', label: 'Defaulters Report' },
  { id: 'installments', label: 'Installment Schedule' },
  { id: 'collection-performance', label: 'Collection Performance' },
];

const CustomerReportingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { showToast, showAlert } = useNotification();
  const localOnly = isLocalOnlyMode();
  const printReport = usePrintReport();

  const filters = useCustomerReportingFiltersStore((s) => s.filters);
  const activeTab = useCustomerReportingFiltersStore((s) => s.activeTab);
  const generated = useCustomerReportingFiltersStore((s) => s.generated);
  const setFilter = useCustomerReportingFiltersStore((s) => s.setFilter);
  const setActiveTab = useCustomerReportingFiltersStore((s) => s.setActiveTab);
  const setGenerated = useCustomerReportingFiltersStore((s) => s.setGenerated);

  const projects = useProjects();
  const contacts = useContacts();
  const units = useUnits();
  const agreements = useProjectAgreements();

  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [drawerContactId, setDrawerContactId] = useState<string | null>(null);

  const enabled = isAuthenticated && !localOnly && generated;

  const summaryQuery = useCustomerReportingSummary(filters, enabled);
  const tabQuery = useCustomerReportTab(activeTab, filters, page, pageSize, enabled);

  const customers = useMemo(
    () =>
      contacts
        .filter((c) => c.type === ContactType.CLIENT || c.type === ContactType.OWNER)
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [contacts]
  );

  const salesAgents = useMemo(() => {
    const ids = new Set<string>();
    for (const pa of agreements) {
      const bid = (pa as { rebateBrokerId?: string }).rebateBrokerId;
      if (bid) ids.add(bid);
    }
    return contacts
      .filter((c) => ids.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agreements, contacts]);

  const unitOptions = useMemo(() => {
    let list = units;
    if (filters.projectId) list = list.filter((u) => u.projectId === filters.projectId);
    return list.map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [units, filters.projectId]);

  const tabRows = useMemo(() => {
    const data = tabQuery.data;
    if (!data) return [];
    if ('rows' in data && Array.isArray(data.rows)) return data.rows;
    return [];
  }, [tabQuery.data]);

  const tabTotalCount = useMemo(() => {
    const data = tabQuery.data;
    if (!data) return 0;
    if ('totalCount' in data) return data.totalCount;
    if ('rows' in data) return data.rows.length;
    return 0;
  }, [tabQuery.data]);

  const handleGenerate = useCallback(() => {
    if (localOnly) {
      void showAlert(
        'Customer Reporting Center requires LAN/API mode. Use Owner Ledger in offline mode or connect to the API server.',
        { title: 'API mode required' }
      );
      return;
    }
    setPage(1);
    setGenerated(true);
  }, [localOnly, setGenerated, showAlert]);

  const handleQuickReport = useCallback(
    async (label: string) => {
      const preset = QUICK_REPORT_PRESETS.find((p) => p.label === label);
      if (!preset) return;
      if (preset.tab) setActiveTab(preset.tab);
      setGenerated(true);
      if (preset.customReport && !localOnly) {
        try {
          await downloadCustomReportExport({
            body: buildCustomReportPayload(preset, filters, 'xlsx'),
            defaultFileName: `${preset.key}.xlsx`,
          });
          showToast(`Exported ${preset.label}`, 'success');
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Export failed', 'error');
        }
      }
    },
    [filters, localOnly, setActiveTab, setGenerated, showToast]
  );

  const handleExportExcel = useCallback(() => {
    if (!tabRows.length) {
      showToast('Generate a report first', 'warning');
      return;
    }
    exportJsonToExcel(tabRows as Record<string, unknown>[], `customer-report-${activeTab}.xlsx`, activeTab);
    showToast('Excel exported', 'success');
  }, [activeTab, showToast, tabRows]);

  const handleExportPdf = useCallback(async () => {
    if (localOnly) {
      printReport({ elementId: 'customer-report-print' });
      return;
    }
    const preset = QUICK_REPORT_PRESETS.find((p) => p.tab === activeTab);
    if (preset?.customReport) {
      try {
        await downloadCustomReportExport({
          body: buildCustomReportPayload(preset, filters, 'pdf'),
          defaultFileName: `customer-report-${activeTab}.pdf`,
        });
        showToast('PDF exported', 'success');
      } catch {
        printReport({ elementId: 'customer-report-print' });
      }
    } else {
      printReport({ elementId: 'customer-report-print' });
    }
  }, [activeTab, filters, localOnly, printReport, showToast]);

  const handlePrint = useCallback(() => {
    printReport({ elementId: 'customer-report-print' });
  }, [printReport]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4">
      <div className="no-print">
        <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Customer Reporting Center
        </h2>
        <p className="text-sm text-app-muted mt-1 max-w-3xl">
          Dashboard-style customer reports for project selling — receivables, defaulters, installments, and collections.
        </p>
      </div>

      <CustomerReportFilterBar
        filters={filters}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        customers={customers}
        units={unitOptions}
        salesAgents={salesAgents}
        onFilterChange={setFilter}
        onGenerate={handleGenerate}
        onExportPdf={handleExportPdf}
        onExportExcel={handleExportExcel}
        onPrint={handlePrint}
        loading={summaryQuery.isFetching}
        quickReportsSlot={<QuickReportsMenu onSelect={handleQuickReport} />}
      />

      {localOnly && (
        <div className="rounded-xl border border-ds-warning/30 bg-app-highlight p-3 text-sm text-app-text no-print">
          Offline SQLite mode: connect to the API server for full Customer Reporting Center features. Quick exports use the legacy custom report engine when online.
        </div>
      )}

      {generated && !localOnly && (
        <>
          <div className="no-print space-y-4">
            <CustomerReportKpiStrip kpis={summaryQuery.data?.kpis} loading={summaryQuery.isLoading} />
            <CustomerAgingWidget aging={summaryQuery.data?.aging} loading={summaryQuery.isLoading} />
          </div>

          <div className="no-print border-b border-app-border flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id);
                  setPage(1);
                }}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-primary text-primary bg-app-highlight'
                    : 'border-transparent text-app-muted hover:text-app-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <CustomerReportTabPanel
            tab={activeTab}
            rows={tabRows}
            loading={tabQuery.isLoading}
            totalCount={tabTotalCount}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onRowClick={setDrawerContactId}
          />
        </>
      )}

      {!generated && (
        <div className="flex-1 flex items-center justify-center text-app-muted text-sm no-print">
          Set filters and click Generate to load customer reports.
        </div>
      )}

      <div id="customer-report-print" className="hidden print:block p-4">
        <ReportHeader reportTitle="Customer Reporting Center" />
        <CustomerReportKpiStrip kpis={summaryQuery.data?.kpis} />
        <CustomerAgingWidget aging={summaryQuery.data?.aging} />
        <CustomerReportTabPanel
          tab={activeTab}
          rows={tabRows}
          totalCount={tabTotalCount}
          page={page}
          pageSize={pageSize}
          onPageChange={() => {}}
        />
        <ReportFooter />
      </div>

      <Customer360Drawer contactId={drawerContactId} onClose={() => setDrawerContactId(null)} />
    </div>
  );
};

export default CustomerReportingPage;
