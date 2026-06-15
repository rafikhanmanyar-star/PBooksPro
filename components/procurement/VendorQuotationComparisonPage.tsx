import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { TransactionType } from '../../types';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import { fetchQuotationComparison } from '../../services/quotationIntelligenceApi';
import type { VendorQuotationComparisonRow } from '../../types';

const PACKAGE_OPTIONS = ['Grey Structure', 'Finishing', 'Electrical', 'Plumbing', 'HVAC', 'Landscaping'];

function localComparison(
  quotations: ReturnType<typeof useFinancialReportAppState>['quotations'],
  vendors: ReturnType<typeof useFinancialReportAppState>['vendors'],
  filters: {
    projectId?: string;
    buildingId?: string;
    packageName?: string;
    categoryId?: string;
    itemName?: string;
  }
): VendorQuotationComparisonRow[] {
  const rows: VendorQuotationComparisonRow[] = [];
  for (const q of quotations ?? []) {
    if (filters.projectId && q.projectId !== filters.projectId) continue;
    if (filters.buildingId && q.buildingId !== filters.buildingId) continue;
    if (filters.packageName && q.packageName?.toLowerCase() !== filters.packageName.toLowerCase()) continue;
    if (q.status && !['Active', 'Approved'].includes(q.status) && q.isActive === false) continue;
    const vendor = vendors?.find((v) => v.id === q.vendorId);
    for (const item of q.items ?? []) {
      if (filters.categoryId && item.categoryId !== filters.categoryId) continue;
      if (filters.itemName && item.itemName?.toLowerCase() !== filters.itemName.toLowerCase()) continue;
      if (item.pricePerQuantity <= 0) continue;
      rows.push({
        vendorId: q.vendorId,
        vendorName: vendor?.name || q.name,
        quotationId: q.id,
        quotationNumber: q.quotationNumber,
        rate: item.pricePerQuantity,
        deliveryPeriod: q.deliveryPeriod,
        warrantyPeriod: q.warrantyPeriod,
        paymentTerms: q.paymentTerms,
        quotationDate: q.date,
      });
    }
  }
  if (!rows.length) return rows;
  const minRate = Math.min(...rows.map((r) => r.rate));
  return rows.map((r) => ({ ...r, isLowestRate: r.rate === minRate }));
}

const VendorQuotationComparisonPage: React.FC = () => {
  const state = useFinancialReportAppState();
  const { projects, buildings, categories } = state;
  const [projectId, setProjectId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === TransactionType.EXPENSE),
    [categories]
  );
  const projectBuildings = useMemo(
    () => (projectId ? buildings.filter((b) => b.projectId === projectId) : buildings),
    [buildings, projectId]
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['quotation-comparison', projectId, buildingId, packageName, categoryId, itemName],
    queryFn: async () => {
      const filters = {
        projectId: projectId || undefined,
        buildingId: buildingId || undefined,
        packageName: packageName || undefined,
        categoryId: categoryId || undefined,
        itemName: itemName || undefined,
      };
              return fetchQuotationComparison(filters);
      return localComparison(state.quotations, state.vendors, filters);
    },
    staleTime: 30_000,
  });

  const rows = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Vendor Quotation Comparison</h2>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <ComboBox label="Project" items={projects} selectedId={projectId} onSelect={(p) => { setProjectId(p?.id || ''); setBuildingId(''); }} placeholder="All projects" entityType="project" />
        <ComboBox label="Building" items={projectBuildings} selectedId={buildingId} onSelect={(b) => setBuildingId(b?.id || '')} placeholder="All buildings" entityType="building" />
        <Select label="Package" value={packageName} onChange={(e) => setPackageName(e.target.value)}>
          <option value="">All packages</option>
          {PACKAGE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <ComboBox label="Category" items={expenseCategories} selectedId={categoryId} onSelect={(c) => setCategoryId(c?.id || '')} placeholder="All categories" entityType="category" />
        <Input label="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Filter by item" />
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-left">Delivery</th>
              <th className="px-3 py-2 text-left">Warranty</th>
              <th className="px-3 py-2 text-left">Payment Terms</th>
              <th className="px-3 py-2 text-center">Select</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No matching quotations found.</td></tr>
            ) : rows.map((row) => (
              <tr key={`${row.quotationId}-${row.vendorId}-${row.rate}`} className={`border-t ${row.isLowestRate ? 'bg-emerald-50' : ''}`}>
                <td className="px-3 py-2 font-medium">
                  {row.vendorName}
                  {row.isLowestRate && <span className="ml-2 text-xs text-emerald-700 font-semibold">Lowest</span>}
                  {row.isBestDelivery && <span className="ml-1 text-xs text-blue-700">Best Delivery</span>}
                  {row.isBestWarranty && <span className="ml-1 text-xs text-purple-700">Best Warranty</span>}
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {row.rate.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })}
                </td>
                <td className="px-3 py-2">{row.deliveryPeriod || '—'}</td>
                <td className="px-3 py-2">{row.warrantyPeriod || '—'}</td>
                <td className="px-3 py-2 max-w-xs truncate">{row.paymentTerms || '—'}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="radio"
                    name="winning-vendor"
                    checked={selectedVendorId === row.vendorId}
                    onChange={() => setSelectedVendorId(row.vendorId)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedVendorId && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-900">
          Winning vendor selected: <strong>{rows.find((r) => r.vendorId === selectedVendorId)?.vendorName}</strong>
        </div>
      )}
    </div>
  );
};

export default VendorQuotationComparisonPage;
