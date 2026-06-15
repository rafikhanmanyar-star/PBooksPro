import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { TransactionType } from '../../types';
import ComboBox from '../ui/ComboBox';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import { fetchVendorPriceHistory } from '../../services/quotationIntelligenceApi';
import type { VendorPriceHistoryEntry } from '../../types';
import { formatDate } from '../../utils/dateUtils';

function localPriceHistory(
  quotations: ReturnType<typeof useFinancialReportAppState>['quotations'],
  vendors: ReturnType<typeof useFinancialReportAppState>['vendors'],
  projects: ReturnType<typeof useFinancialReportAppState>['projects'],
  filters: { vendorId?: string; categoryId?: string; itemName?: string; projectId?: string }
): VendorPriceHistoryEntry[] {
  const entries: VendorPriceHistoryEntry[] = [];
  for (const q of quotations ?? []) {
    if (filters.vendorId && q.vendorId !== filters.vendorId) continue;
    if (filters.projectId && q.projectId !== filters.projectId) continue;
    const vendor = vendors?.find((v) => v.id === q.vendorId);
    const project = projects?.find((p) => p.id === q.projectId);
    for (const item of q.items ?? []) {
      if (filters.categoryId && item.categoryId !== filters.categoryId) continue;
      if (filters.itemName && item.itemName?.toLowerCase() !== filters.itemName.toLowerCase()) continue;
      if (item.pricePerQuantity <= 0) continue;
      entries.push({
        id: `${q.id}_${item.id}`,
        vendorId: q.vendorId,
        vendorName: vendor?.name,
        categoryId: item.categoryId,
        itemName: item.itemName,
        quotationId: q.id,
        quotedRate: item.pricePerQuantity,
        quotationDate: q.date,
        projectId: q.projectId,
        projectName: project?.name,
        isApprovedRate: q.status === 'Approved' || q.isApprovedRate,
      });
    }
  }
  return entries.sort((a, b) => b.quotationDate.localeCompare(a.quotationDate));
}

const VendorPriceHistoryPage: React.FC = () => {
  const state = useFinancialReportAppState();
  const { vendors, categories, projects } = state;
  const [vendorId, setVendorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [projectId, setProjectId] = useState('');

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === TransactionType.EXPENSE),
    [categories]
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['price-history', vendorId, categoryId, itemName, projectId],
    queryFn: async () => {
      const filters = {
        vendorId: vendorId || undefined,
        categoryId: categoryId || undefined,
        itemName: itemName || undefined,
        projectId: projectId || undefined,
      };
      const rows = await fetchVendorPriceHistory(filters);
        return rows.map((r) => ({
          ...r,
          vendorName: vendors?.find((v) => v.id === r.vendorId)?.name,
          projectName: projects?.find((p) => p.id === r.projectId)?.name,
        }));
      return localPriceHistory(state.quotations, state.vendors, state.projects, filters);
    },
    staleTime: 30_000,
  });

  const rows = data ?? [];
  const avgRate = rows.length
    ? Math.round((rows.reduce((s, r) => s + r.quotedRate, 0) / rows.length) * 100) / 100
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Vendor Price History</h2>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border">
        <ComboBox label="Vendor" items={vendors ?? []} selectedId={vendorId} onSelect={(v) => setVendorId(v?.id || '')} placeholder="All vendors" entityType="vendor" />
        <ComboBox label="Category" items={expenseCategories} selectedId={categoryId} onSelect={(c) => setCategoryId(c?.id || '')} placeholder="All categories" entityType="category" />
        <ComboBox label="Project" items={projects} selectedId={projectId} onSelect={(p) => setProjectId(p?.id || '')} placeholder="All projects" entityType="project" />
        <Input label="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Filter by item" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white border rounded-lg">
          <p className="text-xs text-slate-500 uppercase font-bold">Records</p>
          <p className="text-2xl font-bold text-slate-800">{rows.length}</p>
        </div>
        <div className="p-4 bg-white border rounded-lg">
          <p className="text-xs text-slate-500 uppercase font-bold">Average Price</p>
          <p className="text-2xl font-bold text-indigo-700">
            {avgRate.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })}
          </p>
        </div>
        <div className="p-4 bg-white border rounded-lg">
          <p className="text-xs text-slate-500 uppercase font-bold">Latest Rate</p>
          <p className="text-2xl font-bold text-slate-800">
            {rows[0]?.quotedRate.toLocaleString('en-US', { style: 'currency', currency: CURRENCY }) ?? '—'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-center">Approved</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No price history found.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{formatDate(row.quotationDate)}</td>
                <td className="px-3 py-2">{row.vendorName || row.vendorId}</td>
                <td className="px-3 py-2">{row.projectName || '—'}</td>
                <td className="px-3 py-2">{row.itemName || row.categoryId || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {row.quotedRate.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })}
                </td>
                <td className="px-3 py-2 text-center">{row.isApprovedRate ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VendorPriceHistoryPage;
