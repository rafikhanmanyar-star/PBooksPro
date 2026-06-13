import React, { useMemo, useState } from 'react';
import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import {
  buildContractRetentionSummary,
  getContractPaidFromTransactions,
} from '../../utils/contractRetention';
import { retentionStatusBadge } from './ContractRetentionUI';
import type { Contract } from '../../types';

const ContractRetentionMonitoringWidget: React.FC = () => {
  const state = useProjectReportAppState();
  const [projectId, setProjectId] = useState<string>('all');
  const [vendorId, setVendorId] = useState<string>('all');

  const contractRows = useMemo(() => {
    let contracts = (state.contracts || []).filter(
      (c) => (c.retentionType ?? 'NONE') !== 'NONE'
    );
    if (projectId !== 'all') contracts = contracts.filter((c) => c.projectId === projectId);
    if (vendorId !== 'all') contracts = contracts.filter((c) => c.vendorId === vendorId);

    return contracts.map((contract) => {
      const paid = getContractPaidFromTransactions(state.transactions || [], contract.id);
      const summary = buildContractRetentionSummary(contract, paid);
      const project = state.projects.find((p) => p.id === contract.projectId);
      const vendor = state.vendors?.find((v) => v.id === contract.vendorId);
      return { contract, summary, paid, projectName: project?.name ?? '—', vendorName: vendor?.name ?? '—' };
    });
  }, [state.contracts, state.transactions, state.projects, state.vendors, projectId, vendorId]);

  const nearLimit = contractRows.filter((r) => r.summary.alertLevel === 'warning');
  const exceeding = contractRows.filter((r) => r.summary.alertLevel === 'critical');
  const totals = contractRows.reduce(
    (acc, r) => ({
      held: acc.held + r.summary.retentionHeld,
      released: acc.released + r.summary.retentionReleased,
      liability: acc.liability + r.summary.remainingRetention,
    }),
    { held: 0, released: 0, liability: 0 }
  );

  const projectItems = useMemo(
    () => [{ id: 'all', name: 'All Projects' }, ...state.projects],
    [state.projects]
  );
  const vendorItems = useMemo(
    () => [{ id: 'all', name: 'All Vendors' }, ...(state.vendors || [])],
    [state.vendors]
  );

  return (
    <Card className="p-4">
      <h3 className="font-bold text-app-text mb-3">Contract Retention Monitoring</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <ComboBox
          label="Project"
          items={projectItems}
          selectedId={projectId}
          onSelect={(item) => setProjectId(item?.id ?? 'all')}
          placeholder="All Projects"
        />
        <ComboBox
          label="Vendor"
          items={vendorItems}
          selectedId={vendorId}
          onSelect={(item) => setVendorId(item?.id ?? 'all')}
          placeholder="All Vendors"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-sm">
        {[
          { label: 'Near Limit', value: nearLimit.length, tone: 'text-amber-600 dark:text-amber-300' },
          { label: 'Exceeding Limit', value: exceeding.length, tone: 'text-ds-danger' },
          { label: 'Total Retention Held', value: `${CURRENCY} ${totals.held.toLocaleString()}`, tone: 'text-app-text' },
          { label: 'Outstanding Liability', value: `${CURRENCY} ${totals.liability.toLocaleString()}`, tone: 'text-app-text' },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-app-border bg-app-toolbar px-3 py-2">
            <span className="text-xs text-app-muted block">{k.label}</span>
            <span className={`font-bold tabular-nums ${k.tone}`}>{k.value}</span>
          </div>
        ))}
      </div>

      <div className="max-h-48 overflow-y-auto border border-app-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-app-table-header sticky top-0">
            <tr>
              <th className="px-2 py-1 text-left">Contract</th>
              <th className="px-2 py-1 text-left">Project</th>
              <th className="px-2 py-1 text-right">Paid</th>
              <th className="px-2 py-1 text-right">Max Payable</th>
              <th className="px-2 py-1 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {contractRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-app-muted italic">
                  No contracts with retention in this filter.
                </td>
              </tr>
            ) : (
              contractRows.map(({ contract, summary, paid, projectName }) => {
                const badge = retentionStatusBadge(contract, paid);
                return (
                  <tr key={contract.id} className="border-t border-app-border hover:bg-app-table-hover">
                    <td className="px-2 py-1 font-medium">{contract.contractNumber}</td>
                    <td className="px-2 py-1">{projectName}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{paid.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {summary.maximumPayable.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {badge ? (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badge.className}`}>
                          {badge.label}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default ContractRetentionMonitoringWidget;
