import React, { useEffect, useMemo, useState } from 'react';
import Select from '../ui/Select';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { fetchPoBillingContext } from '../../services/purchaseOrdersApi';
import type { PoBillingContext } from '../../services/purchaseOrdersApi';
import type { BillPoLine } from '../../types';
import { CURRENCY } from '../../constants';

export type { PoBillingContext };

interface BillProcurementLinksSectionProps {
  vendorId: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  excludeBillId?: string;
  poBillLines: BillPoLine[];
  getCategoryName?: (categoryId?: string) => string | undefined;
  onPurchaseOrderChange: (poId: string) => void;
  onGoodsReceiptChange: (grnId: string) => void;
  onContextChange?: (ctx: PoBillingContext | null) => void;
  onPoBillLinesChange: (lines: BillPoLine[]) => void;
  onLinesTotalChange?: (total: number) => void;
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

const BillProcurementLinksSection: React.FC<BillProcurementLinksSectionProps> = ({
  vendorId,
  purchaseOrderId,
  goodsReceiptId,
  excludeBillId,
  poBillLines,
  getCategoryName,
  onPurchaseOrderChange,
  onGoodsReceiptChange,
  onContextChange,
  onPoBillLinesChange,
  onLinesTotalChange,
}) => {
  const { data: orders = [] } = usePurchaseOrders({ vendorId });
  const [ctx, setCtx] = useState<PoBillingContext | null>(null);
  const [loading, setLoading] = useState(false);

  const eligiblePos = useMemo(
    () =>
      orders.filter((po) =>
        ['Approved', 'Partially Billed', 'Fully Billed'].includes(po.status)
      ),
    [orders]
  );

  useEffect(() => {
    if (!purchaseOrderId) {
      setCtx(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPoBillingContext(purchaseOrderId, excludeBillId)
      .then((data) => {
        if (!cancelled) {
          setCtx(data);
          onContextChange?.(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCtx(null);
          onContextChange?.(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [purchaseOrderId, excludeBillId, onContextChange]);

  const grnOptions = useMemo(() => {
    const list = ctx?.postedGoodsReceipts ?? [];
    return [
      { value: '', label: 'No specific GRN' },
      ...list.map((g) => ({
        value: g.id,
        label: `${g.grnNumber} (${formatMoney(g.lineTotal)})`,
      })),
    ];
  }, [ctx]);

  const linesTotal = useMemo(
    () => roundMoney(poBillLines.reduce((sum, l) => sum + (l.lineTotal || 0), 0)),
    [poBillLines]
  );

  useEffect(() => {
    onLinesTotalChange?.(linesTotal);
  }, [linesTotal, onLinesTotalChange]);

  const updateLineQty = (poLineId: string, qtyRaw: string) => {
    if (!ctx) return;
    const poLine = ctx.lines.find((l) => l.id === poLineId);
    if (!poLine) return;
    const billedQty = Math.max(0, Number(qtyRaw) || 0);
    const unitRate = poLine.unitRate;
    const lineTotal = roundMoney(billedQty * unitRate);
    const existing = poBillLines.find((l) => l.purchaseOrderLineId === poLineId);
    const next: BillPoLine[] = poBillLines.filter((l) => l.purchaseOrderLineId !== poLineId);
    if (billedQty > 0) {
      next.push({
        id: existing?.id,
        purchaseOrderLineId: poLineId,
        billedQty,
        unitRate,
        lineTotal,
      });
    }
    onPoBillLinesChange(next);
  };

  const fillBillableQty = () => {
    if (!ctx) return;
    const next: BillPoLine[] = [];
    for (const poLine of ctx.lines) {
      if (poLine.billableQty <= 0) continue;
      const existing = poBillLines.find((l) => l.purchaseOrderLineId === poLine.id);
      next.push({
        id: existing?.id,
        purchaseOrderLineId: poLine.id,
        billedQty: poLine.billableQty,
        unitRate: poLine.unitRate,
        lineTotal: roundMoney(poLine.billableQty * poLine.unitRate),
      });
    }
    onPoBillLinesChange(next);
  };

  const getLineQty = (poLineId: string) =>
    poBillLines.find((l) => l.purchaseOrderLineId === poLineId)?.billedQty ?? '';

  if (!vendorId) return null;

  return (
    <div className="rounded-lg border border-app-border bg-app-bg p-3 space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted">Procurement Link</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          id="bill-purchase-order"
          label="Purchase Order (optional)"
          value={purchaseOrderId}
          onChange={(e) => {
            const next = e.target.value;
            onPurchaseOrderChange(next);
            if (!next) {
              onGoodsReceiptChange('');
              onPoBillLinesChange([]);
              onContextChange?.(null);
            }
          }}
          options={[
            { value: '', label: 'No purchase order' },
            ...eligiblePos.map((po) => ({
              value: po.id,
              label: `${po.poNumber} · ${formatMoney(po.totalAmount)}`,
            })),
          ]}
        />
        <Select
          id="bill-goods-receipt"
          label="Goods Receipt (optional)"
          value={goodsReceiptId}
          onChange={(e) => onGoodsReceiptChange(e.target.value)}
          disabled={!purchaseOrderId || grnOptions.length <= 1}
          options={grnOptions}
        />
      </div>
      {loading && <p className="text-xs text-app-muted">Loading PO billing context…</p>}
      {ctx && (
        <>
          <div className="text-xs text-app-text space-y-1 rounded border border-primary/20 bg-primary/5 px-3 py-2">
            <div className="flex justify-between gap-4">
              <span>Received</span>
              <span className="font-medium">{formatMoney(ctx.receivedAmount)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Already billed</span>
              <span className="font-medium">{formatMoney(ctx.billedAmount)}</span>
            </div>
            <div className="flex justify-between gap-4 text-primary font-semibold">
              <span>Billable (received − billed)</span>
              <span>{formatMoney(ctx.billableRemaining)}</span>
            </div>
            {ctx.receivedAmount <= 0 && (
              <p className="text-ds-warning pt-1">
                Goods must be received via GRN before billing this purchase order.
              </p>
            )}
          </div>

          {ctx.lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-app-muted">
                  PO line billing
                </h5>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={fillBillableQty}
                  disabled={ctx.lines.every((l) => l.billableQty <= 0)}
                >
                  Fill billable qty
                </button>
              </div>
              <div className="overflow-x-auto rounded border border-app-border">
                <table className="w-full text-xs">
                  <thead className="bg-app-surface text-app-muted">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Item</th>
                      <th className="text-left px-2 py-1.5 font-medium">Category</th>
                      <th className="text-right px-2 py-1.5 font-medium">Rcvd</th>
                      <th className="text-right px-2 py-1.5 font-medium">Billed</th>
                      <th className="text-right px-2 py-1.5 font-medium">Billable</th>
                      <th className="text-right px-2 py-1.5 font-medium w-20">Bill qty</th>
                      <th className="text-right px-2 py-1.5 font-medium">Rate</th>
                      <th className="text-right px-2 py-1.5 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.lines.map((line) => {
                      const draft = poBillLines.find((l) => l.purchaseOrderLineId === line.id);
                      const label = line.itemName || line.description || 'Line item';
                      const categoryLabel =
                        getCategoryName?.(line.categoryId) ??
                        (line.categoryId ? 'Category' : '—');
                      return (
                        <tr key={line.id} className="border-t border-app-border">
                          <td className="px-2 py-1.5">{label}</td>
                          <td className="px-2 py-1.5 text-app-text">{categoryLabel}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{line.receivedQty}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{line.billedQty}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                            {line.billableQty}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              max={line.billableQty}
                              step="any"
                              className="w-full rounded border border-app-border bg-app-bg px-1.5 py-0.5 text-right text-xs"
                              value={getLineQty(line.id)}
                              disabled={line.billableQty <= 0}
                              onChange={(e) => updateLineQty(line.id, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatMoney(line.unitRate)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                            {draft ? formatMoney(draft.lineTotal) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-app-border bg-app-surface">
                    <tr>
                      <td colSpan={7} className="px-2 py-1.5 text-right font-semibold">
                        Lines total
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                        {formatMoney(linesTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {linesTotal > 0 && (
                <p className="text-xs text-app-muted">
                  Bill amount will be set to {formatMoney(linesTotal)} from PO line totals.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BillProcurementLinksSection;
