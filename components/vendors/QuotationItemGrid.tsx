import React, { useCallback } from 'react';
import { QuotationItem, TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import Input from '../ui/Input';
import AmountInput from '../common/AmountInput';
import ComboBox from '../ui/ComboBox';
import Button from '../ui/Button';
import { useQuotationItemRates, computeVariancePercent, varianceSeverity } from '../../hooks/useQuotationItemRates';

interface QuotationItemGridProps {
  items: QuotationItem[];
  vendorId?: string;
  expenseCategories: Array<{ id: string; name: string }>;
  onChange: (items: QuotationItem[]) => void;
  onAddNewCategory: (name: string, onCreated: (id: string) => void) => void;
  compact?: boolean;
}

const fmt = (n?: number) =>
  n != null ? n.toLocaleString('en-US', { style: 'currency', currency: CURRENCY }) : '—';

const severityClass: Record<string, string> = {
  green: 'text-emerald-600',
  yellow: 'text-amber-600',
  red: 'text-rose-600',
  none: 'text-slate-500',
};

const QuotationItemGrid: React.FC<QuotationItemGridProps> = ({
  items,
  vendorId = '',
  expenseCategories,
  onChange,
  onAddNewCategory,
  compact = false,
}) => {
  const { lookupRates } = useQuotationItemRates(vendorId);

  const updateItem = (itemId: string, patch: Partial<QuotationItem>) => {
    onChange(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  };

  const handleCategorySelect = useCallback(
    async (item: QuotationItem, categoryId: string) => {
      const category = expenseCategories.find((c) => c.id === categoryId);
      const rates = await lookupRates(categoryId, item.itemName);
      const previousRate = rates.previousRate;
      const unitRate = item.pricePerQuantity || 0;
      updateItem(item.id, {
        categoryId,
        itemName: item.itemName || category?.name,
        previousRate,
        marketRate: rates.averageMarketRate,
        variancePercent: computeVariancePercent(unitRate, previousRate),
      });
    },
    [expenseCategories, lookupRates, items]
  );

  const handleUnitRateChange = (item: QuotationItem, rate: number) => {
    const variancePercent = computeVariancePercent(rate, item.previousRate);
    const qty = item.quantity || 0;
    updateItem(item.id, {
      pricePerQuantity: rate,
      variancePercent,
      totalAmount: qty * rate,
    });
  };

  const handleQuantityChange = (item: QuotationItem, qty: number) => {
    updateItem(item.id, {
      quantity: qty,
      totalAmount: qty * (item.pricePerQuantity || 0),
    });
  };

  const addItem = () => {
    onChange([
      ...items,
      {
        id: `item_${Date.now()}`,
        categoryId: '',
        quantity: 0,
        pricePerQuantity: 0,
        approvalThresholdPercent: 5,
      },
    ]);
  };

  const removeItem = (itemId: string) => {
    onChange(items.filter((i) => i.id !== itemId));
  };

  if (!items.length) {
    return (
      <div className={`text-center ${compact ? 'py-3' : 'py-8'} text-slate-500`}>
        <p className={compact ? 'text-xs' : undefined}>No items added yet.</p>
        <Button type="button" variant="secondary" onClick={addItem} className="mt-2" size="sm">
          <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
          Add Item
        </Button>
      </div>
    );
  }

  const cellPad = compact ? 'px-1 py-1' : 'px-2 py-2';
  const headPad = compact ? 'px-1 py-1 text-xs' : 'px-2 py-2';

  return (
    <div className={compact ? 'space-y-1' : 'space-y-3'}>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={addItem} size="sm">
          <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
          Add Item
        </Button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className={`min-w-full ${compact ? 'text-xs' : 'text-sm'}`}>
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className={`${headPad} text-left font-semibold`}>Category</th>
              <th className={`${headPad} text-left font-semibold`}>Item</th>
              <th className={`${headPad} text-left font-semibold`}>Brand</th>
              <th className={`${headPad} text-left font-semibold`}>Spec</th>
              <th className={`${headPad} text-left font-semibold`}>Unit</th>
              <th className={`${headPad} text-right font-semibold`}>Qty</th>
              <th className={`${headPad} text-right font-semibold`}>Rate</th>
              <th className={`${headPad} text-right font-semibold`}>Last</th>
              <th className={`${headPad} text-right font-semibold`}>Mkt</th>
              <th className={`${headPad} text-right font-semibold`}>Var%</th>
              <th className={`${headPad} text-right font-semibold`}>Total</th>
              <th className={headPad} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const severity = varianceSeverity(item.variancePercent, item.approvalThresholdPercent ?? 5);
              const lineTotal = (item.quantity || 0) * (item.pricePerQuantity || 0);
              return (
                <tr key={item.id} className="border-t border-slate-200 align-top">
                  <td className={`${cellPad} min-w-[120px]`}>
                    <ComboBox
                      id={`qi-cat-${item.id}`}
                      items={expenseCategories}
                      selectedId={item.categoryId}
                      onSelect={(sel) => void handleCategorySelect(item, sel?.id || '')}
                      placeholder="Category"
                      entityType="category"
                      onAddNew={(_t, name) => onAddNewCategory(name, (id) => void handleCategorySelect(item, id))}
                    />
                  </td>
                  <td className={`${cellPad} min-w-[100px]`}>
                    <Input
                      value={item.itemName || ''}
                      onChange={(e) => updateItem(item.id, { itemName: e.target.value })}
                      placeholder="Item name"
                    />
                  </td>
                  <td className={`${cellPad} min-w-[80px]`}>
                    <Input value={item.brand || ''} onChange={(e) => updateItem(item.id, { brand: e.target.value })} />
                  </td>
                  <td className={`${cellPad} min-w-[90px]`}>
                    <Input
                      value={item.specification || ''}
                      onChange={(e) => updateItem(item.id, { specification: e.target.value })}
                    />
                  </td>
                  <td className={`${cellPad} min-w-[60px]`}>
                    <Input value={item.unit || ''} onChange={(e) => updateItem(item.id, { unit: e.target.value })} />
                  </td>
                  <td className={`${cellPad} min-w-[60px]`}>
                    <Input
                      type="number"
                      value={String(item.quantity || 0)}
                      onChange={(e) => handleQuantityChange(item, parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className={`${cellPad} min-w-[80px]`}>
                    <AmountInput
                      value={item.pricePerQuantity || 0}
                      onChange={(e) => handleUnitRateChange(item, parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className={`${cellPad} text-right text-slate-600 whitespace-nowrap`}>{fmt(item.previousRate)}</td>
                  <td className={`${cellPad} text-right text-slate-600 whitespace-nowrap`}>{fmt(item.marketRate)}</td>
                  <td className={`${cellPad} text-right font-medium whitespace-nowrap ${severityClass[severity]}`}>
                    {item.variancePercent != null ? `${item.variancePercent.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`${cellPad} text-right font-semibold whitespace-nowrap`}>{fmt(lineTotal)}</td>
                  <td className={cellPad}>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuotationItemGrid;
