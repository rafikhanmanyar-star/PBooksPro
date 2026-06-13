import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { ContractStatus } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
  buildContractRetentionSummary,
  getContractPaidFromTransactions,
} from '../../utils/contractRetention';

interface RetentionRegisterRow {
  contractId: string;
  contractNumber: string;
  projectName: string;
  vendorName: string;
  contractValue: number;
  retentionPct: string;
  retentionAmount: number;
  paidAmount: number;
  retentionReleased: number;
  outstandingRetention: number;
  status: string;
}

const ContractRetentionRegisterReport: React.FC = () => {
  const state = useProjectReportAppState();
  const { print: triggerPrint } = usePrintContext();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
  const [searchQuery, setSearchQuery] = useState('');

  const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

  const reportData = useMemo<RetentionRegisterRow[]>(() => {
    let contracts = (state.contracts || []).filter(
      (c) => (c.retentionType ?? 'NONE') !== 'NONE'
    );

    if (selectedProjectId !== 'all') {
      contracts = contracts.filter((c) => c.projectId === selectedProjectId);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      contracts = contracts.filter(
        (c) =>
          c.contractNumber.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      );
    }

    return contracts
      .map((contract) => {
        const project = state.projects.find((p) => p.id === contract.projectId);
        const vendor = state.vendors?.find((v) => v.id === contract.vendorId);
        const paidAmount = getContractPaidFromTransactions(state.transactions || [], contract.id);
        const summary = buildContractRetentionSummary(contract, paidAmount);

        return {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          projectName: project?.name || 'Unknown',
          vendorName: vendor?.name || 'Unknown',
          contractValue: summary.contractValue,
          retentionPct:
            contract.retentionType === 'PERCENTAGE' && contract.retentionPercentage != null
              ? `${contract.retentionPercentage}%`
              : '—',
          retentionAmount: summary.retentionAmount,
          paidAmount,
          retentionReleased: summary.retentionReleased,
          outstandingRetention: summary.remainingRetention,
          status: contract.status,
        };
      })
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [
    state.contracts,
    state.transactions,
    state.projects,
    state.vendors,
    selectedProjectId,
    searchQuery,
  ]);

  const handleExport = () => {
    exportJsonToExcel(
      'Contract_Retention_Register',
      [
        {
          name: 'Retention Register',
          headers: [
            'Contract No',
            'Project',
            'Vendor',
            'Contract Value',
            'Retention %',
            'Retention Amount',
            'Paid Amount',
            'Retention Released',
            'Outstanding Retention',
            'Status',
          ],
          rows: reportData.map((r) => [
            r.contractNumber,
            r.projectName,
            r.vendorName,
            r.contractValue,
            r.retentionPct,
            r.retentionAmount,
            r.paidAmount,
            r.retentionReleased,
            r.outstandingRetention,
            r.status,
          ]),
        },
      ]
    );
  };

  return (
    <div className="flex flex-col h-full">
      <ReportToolbar
        onPrint={() => triggerPrint({ elementId: 'contract-retention-register-print' })}
        onExportExcel={handleExport}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search contracts..."
        filters={
          <ComboBox
            label="Project"
            items={projectItems}
            selectedId={selectedProjectId}
            onSelect={(item) => setSelectedProjectId(item?.id ?? 'all')}
            placeholder="All Projects"
          />
        }
      />

      <Card className="flex-grow overflow-auto p-4" id="contract-retention-register-print">
        <style>{STANDARD_PRINT_STYLES}</style>
        <ReportHeader />
        <h2 className="text-xl font-bold text-app-text mb-4">Contract Retention Register</h2>

        <table className="w-full text-sm border-collapse border border-app-border">
          <thead>
            <tr className="bg-app-table-header">
              {[
                'Contract No',
                'Project',
                'Vendor',
                'Contract Value',
                'Retention %',
                'Retention Amount',
                'Paid Amount',
                'Released',
                'Outstanding Retention',
                'Status',
              ].map((h) => (
                <th key={h} className="border border-app-border px-2 py-2 text-left text-app-text">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportData.length === 0 ? (
              <tr>
                <td colSpan={10} className="border border-app-border px-2 py-6 text-center text-app-muted italic">
                  No contracts with retention configured.
                </td>
              </tr>
            ) : (
              reportData.map((row) => (
                <tr key={row.contractId} className="hover:bg-app-table-hover">
                  <td className="border border-app-border px-2 py-1 font-mono text-xs">{row.contractNumber}</td>
                  <td className="border border-app-border px-2 py-1">{row.projectName}</td>
                  <td className="border border-app-border px-2 py-1">{row.vendorName}</td>
                  <td className="border border-app-border px-2 py-1 text-right tabular-nums">
                    {CURRENCY} {row.contractValue.toLocaleString()}
                  </td>
                  <td className="border border-app-border px-2 py-1 text-center">{row.retentionPct}</td>
                  <td className="border border-app-border px-2 py-1 text-right tabular-nums">
                    {CURRENCY} {row.retentionAmount.toLocaleString()}
                  </td>
                  <td className="border border-app-border px-2 py-1 text-right tabular-nums">
                    {CURRENCY} {row.paidAmount.toLocaleString()}
                  </td>
                  <td className="border border-app-border px-2 py-1 text-right tabular-nums">
                    {CURRENCY} {row.retentionReleased.toLocaleString()}
                  </td>
                  <td className="border border-app-border px-2 py-1 text-right tabular-nums">
                    {CURRENCY} {row.outstandingRetention.toLocaleString()}
                  </td>
                  <td className="border border-app-border px-2 py-1 text-center">{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ReportFooter />
      </Card>
    </div>
  );
};

export default ContractRetentionRegisterReport;
