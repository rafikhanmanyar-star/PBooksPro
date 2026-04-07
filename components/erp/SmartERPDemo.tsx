import React, { useCallback, useMemo, useState } from 'react';
import { computeFormulas } from './formulaEngine';
import { SmartInput } from './SmartInput';
import { SmartTable, type SmartColumnDef } from './SmartTable';
import { SmartDropdown, type SmartDropdownItem } from './SmartDropdown';
import { runValidation, Rules, type ValidationRule } from './validation';

type DemoRow = {
  id: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
};

/**
 * In-app showcase: wire `SmartInput`, `SmartTable`, and `SmartDropdown` with in-memory state.
 * Integrate real screens by replacing `setRows` / `onSaveCell` with repository + `window.sqliteBridge.run`.
 */
export const SmartERPDemo: React.FC<{ className?: string }> = ({ className = '' }) => {
  const formulas = useMemo(
    () => ({
      total: 'qty * rate',
      grand_total: 'total + tax',
    }),
    []
  );

  const [smartValues, setSmartValues] = useState(() =>
    computeFormulas(formulas, { qty: 2, rate: 150, tax: 15 })
  );

  const validationRules: ValidationRule<Record<string, unknown>>[] = useMemo(
    () => [
      Rules.minNumber('qty', 0, 'Quantity cannot be negative'),
      Rules.minNumber('rate', 0, 'Rate cannot be negative'),
      Rules.custom('grand_total', 'Grand total must be non-negative', (v) => Number(v.grand_total) >= 0),
    ],
    []
  );

  const fieldErrors = runValidation(
    { ...smartValues } as Record<string, unknown>,
    validationRules
  );

  const [rows, setRows] = useState<DemoRow[]>(() =>
    Array.from({ length: 120 }, (_, i) => ({
      id: `r-${i}`,
      description: `Line ${i + 1}`,
      qty: 1 + (i % 5),
      rate: 10 + i,
      amount: 0,
    })).map((r) => ({ ...r, amount: r.qty * r.rate }))
  );

  const columns: SmartColumnDef<DemoRow>[] = useMemo(
    () => [
      { id: 'description', header: 'Description', width: 200, sortable: true, accessor: (r) => r.description },
      {
        id: 'qty',
        header: 'Qty',
        width: 90,
        numeric: true,
        sum: true,
        sortable: true,
        editable: true,
        accessor: (r) => r.qty,
        parse: (raw) => parseFloat(String(raw).trim()) || 0,
        validate: (v) => (Number(v) < 0 ? 'Qty cannot be negative' : null),
      },
      {
        id: 'rate',
        header: 'Rate',
        width: 100,
        numeric: true,
        sum: true,
        sortable: true,
        editable: true,
        accessor: (r) => r.rate,
        parse: (raw) => parseFloat(String(raw).trim()) || 0,
      },
      {
        id: 'amount',
        header: 'Amount',
        width: 120,
        numeric: true,
        sum: true,
        sortable: true,
        accessor: (r) => r.amount,
      },
    ],
    []
  );

  const onSaveCell = useCallback(async (rowId: string, columnId: string, value: unknown, _row: DemoRow) => {
    await new Promise((r) => setTimeout(r, 80));
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, [columnId]: value } as DemoRow;
        next.amount = next.qty * next.rate;
        return next;
      })
    );
  }, []);

  const customers: SmartDropdownItem[] = useMemo(
    () => [
      { id: '1', name: 'Ali Traders', meta: { address: 'Karachi', balance: 1200, terms: 'Net 30' } },
      { id: '2', name: 'Ali & Sons', meta: { address: 'Lahore', balance: 0, terms: 'COD' } },
      { id: '3', name: 'Sara Builders', meta: { address: 'Islamabad', balance: -500, terms: 'Net 15' } },
    ],
    []
  );

  const [custId, setCustId] = useState('');
  const [fillNote, setFillNote] = useState('');

  return (
    <div className={`space-y-6 p-ds-md max-w-5xl ${className}`}>
      <div>
        <h2 className="text-lg font-semibold text-app-text mb-ds-sm">Smart ERP components (demo)</h2>
        <p className="text-ds-small text-app-muted">
          Formulas: total = qty × rate; grand total = total + tax. Table uses virtualization for large row counts; inline
          edits call async save (simulate DB).
        </p>
      </div>

      <section className="rounded-ds-md border border-app-border p-ds-md bg-app-card space-y-ds-md">
        <h3 className="text-ds-body font-medium text-app-text">SmartInput</h3>
        <SmartInput
          editableKeys={['qty', 'rate', 'tax']}
          formulas={formulas}
          values={smartValues}
          onValuesChange={setSmartValues}
          labels={{ qty: 'Qty', rate: 'Rate', tax: 'Tax', total: 'Total', grand_total: 'Grand total' }}
          errors={fieldErrors}
        />
      </section>

      <section className="rounded-ds-md border border-app-border p-ds-md bg-app-card space-y-ds-md">
        <h3 className="text-ds-body font-medium text-app-text">SmartDropdown + auto-fill meta</h3>
        <SmartDropdown
          label="Customer"
          items={customers}
          selectedId={custId}
          onSelect={(item, meta, newName) => {
            setCustId(item?.id ?? '');
            if (meta) {
              setFillNote(
                `Address: ${meta.address} · Balance: ${meta.balance} · Terms: ${meta.terms}${newName ? ` · (new: ${newName})` : ''}`
              );
            } else {
              setFillNote(newName ? `New contact name: ${newName}` : '');
            }
          }}
          placeholder="Type to filter (e.g. Ali)…"
          entityType="contact"
        />
        {fillNote ? <p className="text-ds-small text-app-muted">{fillNote}</p> : null}
      </section>

      <section className="rounded-ds-md border border-app-border p-ds-md bg-app-card">
        <h3 className="text-ds-body font-medium text-app-text mb-ds-md">SmartTable (120 rows, virtualized)</h3>
        <SmartTable<DemoRow>
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          virtualize
          onSaveCell={onSaveCell}
          searchPlaceholder="Search lines…"
        />
      </section>
    </div>
  );
};

export default SmartERPDemo;
