import React, { useMemo, useState } from 'react';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { TransactionType } from '../../types';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import { useQuotationComparison, useQuotationComparisonWorkflow } from '../../hooks/useQuotationComparison';
import { usePermissions } from '../../hooks/usePermissions';
import type { VendorQuotationComparisonRow } from '../../types';

const PACKAGE_OPTIONS = ['Grey Structure', 'Finishing', 'Electrical', 'Plumbing', 'HVAC', 'Landscaping'];

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`ml-1 text-xs font-semibold px-1.5 py-0.5 rounded ${className}`}>{children}</span>
  );
}

const VendorQuotationComparisonPage: React.FC = () => {
  const state = useFinancialReportAppState();
  const { projects, buildings, categories } = state;
  const perms = usePermissions();
  const [projectId, setProjectId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState<number | undefined>();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      projectId: projectId || undefined,
      buildingId: buildingId || undefined,
      packageName: packageName || undefined,
      categoryId: categoryId || undefined,
      itemName: itemName || undefined,
    }),
    [projectId, buildingId, packageName, categoryId, itemName]
  );

  const { data, isFetching, refetch } = useQuotationComparison(filters);
  const { createSession, prefer, approve, convertToPo } = useQuotationComparisonWorkflow();

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === TransactionType.EXPENSE),
    [categories]
  );
  const projectBuildings = useMemo(
    () => (projectId ? buildings.filter((b) => b.projectId === projectId) : buildings),
    [buildings, projectId]
  );

  const rows = data?.matrix ?? [];
  const recommended = data?.recommended ?? null;

  const startSession = async () => {
    setErrorMessage(null);
    try {
      const result = await createSession.mutateAsync({ ...filters });
      setSessionId(result.session.id);
      setSessionVersion(result.session.version);
      setStatusMessage('Comparison session started.');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to start comparison session.');
    }
  };

  const handlePrefer = async (row: VendorQuotationComparisonRow) => {
    if (!perms.canSelectQuotation) return;
    setErrorMessage(null);
    try {
      let activeSessionId = sessionId;
      let version = sessionVersion;
      if (!activeSessionId) {
        const created = await createSession.mutateAsync({ ...filters });
        activeSessionId = created.session.id;
        version = created.session.version;
        setSessionId(activeSessionId);
        setSessionVersion(version);
      }
      const session = await prefer.mutateAsync({
        sessionId: activeSessionId!,
        quotationId: row.quotationId,
        version,
      });
      setSessionVersion(session.version);
      setStatusMessage(`Preferred vendor: ${row.vendorName}`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to mark preferred quotation.');
    }
  };

  const handleApprove = async (row: VendorQuotationComparisonRow) => {
    if (!perms.canApproveQuotation) return;
    setErrorMessage(null);
    try {
      const result = await approve.mutateAsync({
        quotationId: row.quotationId,
        sessionId: sessionId ?? undefined,
      });
      if (result.session) setSessionVersion(result.session.version);
      setStatusMessage(`Quotation approved for ${row.vendorName}`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to approve quotation.');
    }
  };

  const handleConvertToPo = async (row: VendorQuotationComparisonRow) => {
    if (!perms.canApproveQuotation) return;
    setErrorMessage(null);
    try {
      const result = await convertToPo.mutateAsync({
        quotationId: row.quotationId,
        sessionId: sessionId ?? undefined,
      });
      const poNumber = String(result.purchaseOrder.poNumber ?? '');
      if (result.session) setSessionVersion(result.session.version);
      setStatusMessage(`Purchase order ${poNumber} created from ${row.vendorName} quotation.`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to convert quotation to purchase order.');
    }
  };

  const busy =
    isFetching ||
    createSession.isPending ||
    prefer.isPending ||
    approve.isPending ||
    convertToPo.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Vendor Quotation Comparison</h2>
          <p className="text-sm text-slate-500 mt-1">
            Compare unit price, totals, delivery, payment terms, warranty, and vendor rating.
          </p>
        </div>
        <div className="flex gap-2">
          {perms.canCompareQuotations && (
            <Button variant="secondary" onClick={() => void startSession()} disabled={busy || rows.length === 0}>
              Save Comparison
            </Button>
          )}
          <Button variant="secondary" onClick={() => void refetch()} disabled={busy}>
            Refresh
          </Button>
        </div>
      </div>

      {recommended && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <strong>Recommended:</strong> {recommended.vendorName} — score {recommended.recommendationScore}/100
          {recommended.quotationNumber ? ` (${recommended.quotationNumber})` : ''}
        </div>
      )}

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errorMessage}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <ComboBox
          label="Project"
          items={projects}
          selectedId={projectId}
          onSelect={(p) => {
            setProjectId(p?.id || '');
            setBuildingId('');
          }}
          placeholder="All projects"
          entityType="project"
        />
        <ComboBox
          label="Building"
          items={projectBuildings}
          selectedId={buildingId}
          onSelect={(b) => setBuildingId(b?.id || '')}
          placeholder="All buildings"
          entityType="building"
        />
        <Select label="Package" value={packageName} onChange={(e) => setPackageName(e.target.value)}>
          <option value="">All packages</option>
          {PACKAGE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <ComboBox
          label="Category"
          items={expenseCategories}
          selectedId={categoryId}
          onSelect={(c) => setCategoryId(c?.id || '')}
          placeholder="All categories"
          entityType="category"
        />
        <Input label="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Filter by item" />
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-right">Unit Price</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Delivery</th>
              <th className="px-3 py-2 text-left">Payment Terms</th>
              <th className="px-3 py-2 text-left">Warranty</th>
              <th className="px-3 py-2 text-center">Rating</th>
              <th className="px-3 py-2 text-center">Score</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  {isFetching ? 'Loading comparison…' : 'No matching quotations found.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.quotationId}-${row.vendorId}-${row.unitPrice}`}
                  className={`border-t ${row.isRecommended ? 'bg-amber-50' : row.isLowestRate ? 'bg-emerald-50/60' : ''}`}
                >
                  <td className="px-3 py-2 font-medium">
                    <div>{row.vendorName}</div>
                    {row.quotationNumber && (
                      <div className="text-xs text-slate-500">{row.quotationNumber}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {row.isRecommended && <Badge className="bg-amber-200 text-amber-900">Recommended</Badge>}
                      {row.isLowestRate && <Badge className="bg-emerald-200 text-emerald-900">Lowest Price</Badge>}
                      {row.isBestDelivery && <Badge className="bg-blue-100 text-blue-800">Best Delivery</Badge>}
                      {row.isBestWarranty && <Badge className="bg-purple-100 text-purple-800">Best Warranty</Badge>}
                      {row.isHighestRated && <Badge className="bg-indigo-100 text-indigo-800">Top Rated</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.unitPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(row.totalAmount)}</td>
                  <td className="px-3 py-2">{row.deliveryPeriod || '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate">{row.paymentTerms || '—'}</td>
                  <td className="px-3 py-2">{row.warrantyPeriod || '—'}</td>
                  <td className="px-3 py-2 text-center">{row.vendorRating != null ? row.vendorRating.toFixed(1) : '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold">{row.recommendationScore ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 items-stretch min-w-[7rem]">
                      {perms.canSelectQuotation && (
                        <Button size="sm" variant="secondary" onClick={() => void handlePrefer(row)} disabled={busy}>
                          Prefer
                        </Button>
                      )}
                      {perms.canApproveQuotation && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => void handleApprove(row)} disabled={busy}>
                            Approve
                          </Button>
                          <Button size="sm" onClick={() => void handleConvertToPo(row)} disabled={busy}>
                            Create PO
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!perms.canCompareQuotations && (
        <p className="text-sm text-slate-500">You do not have permission to compare quotations.</p>
      )}
    </div>
  );
};

export default VendorQuotationComparisonPage;
