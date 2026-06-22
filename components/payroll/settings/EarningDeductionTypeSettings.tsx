import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, TrendingUp, TrendingDown, Percent, DollarSign } from 'lucide-react';
import { payrollApi } from '../../../services/api/payrollApi';
import { EarningType, DeductionType } from '../types';
import SalaryConfigModal from '../modals/SalaryConfigModal';
import { formatCurrency } from '../utils/formatters';

const EarningDeductionTypeSettings: React.FC = () => {
  const [earningTypes, setEarningTypes] = useState<EarningType[]>([]);
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<'earning' | 'deduction'>('earning');
  const [editingItem, setEditingItem] = useState<EarningType | DeductionType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, d] = await Promise.all([
        payrollApi.getEarningTypes(),
        payrollApi.getDeductionTypes(),
      ]);
      setEarningTypes(e);
      setDeductionTypes(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (kind: 'earning' | 'deduction', name: string) => {
    if (!window.confirm(`Delete ${kind} type "${name}"? Existing payslips are unaffected.`)) return;
    if (kind === 'earning') {
      const next = earningTypes.filter(t => t.name !== name);
      await payrollApi.saveEarningTypes(next);
      setEarningTypes(next);
    } else {
      const next = deductionTypes.filter(t => t.name !== name);
      await payrollApi.saveDeductionTypes(next);
      setDeductionTypes(next);
    }
  };

  const openAdd = (kind: 'earning' | 'deduction') => {
    setModalKind(kind);
    setEditingItem(null);
    setModalOpen(true);
  };

  const openEdit = (kind: 'earning' | 'deduction', item: EarningType | DeductionType) => {
    setModalKind(kind);
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleSaved = () => { void load(); };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-app-muted text-sm py-2">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </div>
    );
  }

  const renderList = (
    title: string,
    icon: React.ReactNode,
    items: (EarningType | DeductionType)[],
    kind: 'earning' | 'deduction',
    badgeClass: string
  ) => (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black text-app-text flex items-center gap-2">
          {icon}
          {title}
          <span className="ml-1 text-xs font-semibold text-app-muted bg-app-toolbar px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </h4>
        <button
          type="button"
          onClick={() => openAdd(kind)}
          className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/70 transition-colors"
        >
          <Plus size={13} />
          Add {kind === 'earning' ? 'Earning' : 'Deduction'}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-app-muted text-sm bg-app-toolbar/40 rounded-xl border border-dashed border-app-border">
          No {kind} types yet. Add one to use in employee salary structures.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map(t => (
            <li
              key={t.name}
              className="flex items-center justify-between gap-3 p-3 bg-app-toolbar/30 rounded-xl border border-app-border group hover:bg-app-table-hover transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`p-1.5 rounded-lg shrink-0 ${badgeClass}`}>
                  {t.is_percentage ? <Percent size={12} /> : <DollarSign size={12} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-app-text truncate">{t.name}</p>
                  <p className="text-xs text-app-muted">
                    {t.is_percentage
                      ? `${t.amount}% of basic`
                      : `PKR ${formatCurrency(typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount)} fixed`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(kind, t)}
                  className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-toolbar rounded-lg transition-all"
                  aria-label={`Edit ${t.name}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(kind, t.name)}
                  className="p-1.5 text-app-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <p className="text-sm text-app-muted mb-4">
        Define the earning and deduction component types available for employee salary structures. These act as a catalog — individual employee amounts are set on their profile.
      </p>
      <div className="flex flex-col md:flex-row gap-6">
        {renderList(
          'Earning Types',
          <TrendingUp size={14} className="text-ds-success" />,
          earningTypes,
          'earning',
          'bg-ds-success/15 text-ds-success'
        )}
        <div className="hidden md:block w-px bg-app-border self-stretch" />
        {renderList(
          'Deduction Types',
          <TrendingDown size={14} className="text-red-500" />,
          deductionTypes,
          'deduction',
          'bg-red-100 text-red-500'
        )}
      </div>

      <SalaryConfigModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalKind}
        initialData={editingItem}
        onSave={handleSaved}
      />
    </>
  );
};

export default EarningDeductionTypeSettings;
