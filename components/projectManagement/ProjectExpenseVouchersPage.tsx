import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ProjectExpenseVoucherApiRepository } from '../../services/api/repositories/projectExpenseVoucherApi';
import type { ProjectExpenseVoucher } from '../../types';
import { AccountType, TransactionType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { toLocalDateString } from '../../utils/dateUtils';
import { formatApiErrorMessage } from '../../services/api/client';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';

const pevApi = new ProjectExpenseVoucherApiRepository();

type InlineForm = {
  voucherDate: string;
  projectId: string;
  vendorId: string;
  expenseCategoryId: string;
  amount: string;
  paymentSourceAccountId: string;
  description: string;
};

const emptyInline = (defaultProjectId?: string): InlineForm => ({
  voucherDate: toLocalDateString(new Date()),
  projectId: defaultProjectId || '',
  vendorId: '',
  expenseCategoryId: '',
  amount: '',
  paymentSourceAccountId: '',
  description: '',
});

interface ProjectExpenseVouchersPageProps {
  projectContext?: boolean;
}

const ProjectExpenseVouchersPage: React.FC<ProjectExpenseVouchersPageProps> = ({ projectContext }) => {
  const state = useFinancialReportAppState();
  const { projects, vendors, accounts, categories, defaultProjectId } = state;
  const { showToast, showAlert } = useNotification();
  const { canReadPeV, canCreatePeV } = usePermissions();
  const entityFormModal = useEntityFormModal();

  const [vouchers, setVouchers] = useState<ProjectExpenseVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string>(
    projectContext && defaultProjectId ? defaultProjectId : 'all'
  );
  const [inline, setInline] = useState<InlineForm>(() =>
    emptyInline(projectContext ? defaultProjectId || undefined : undefined)
  );

  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.isActive !== false &&
          (a.type === AccountType.BANK || a.type === AccountType.CASH) &&
          a.name !== 'Internal Clearing'
      ),
    [accounts]
  );

  const expenseCategories = useMemo(
    () =>
      categories
        .filter((c) => c.type === TransactionType.EXPENSE && !c.isHidden)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const categoryItems = useMemo(
    () => expenseCategories.map((c) => ({ id: c.id, name: c.name })),
    [expenseCategories]
  );

  const vendorItems = useMemo(
    () => [{ id: '', name: '— None —' }, ...vendors.map((v) => ({ id: v.id, name: v.name }))],
    [vendors]
  );

  const projectFilterItems = useMemo(
    () => [{ id: 'all', name: 'All Projects' }, ...projects],
    [projects]
  );

  const loadData = useCallback(async () => {
    if (!canReadPeV) return;
    setLoading(true);
    try {
      const vList = await pevApi.findAll({
        projectId: filterProjectId !== 'all' ? filterProjectId : undefined,
      });
      setVouchers(vList);
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setLoading(false);
    }
  }, [canReadPeV, filterProjectId, showAlert]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (projectContext && defaultProjectId) {
      setInline((f) => ({ ...f, projectId: defaultProjectId }));
      setFilterProjectId(defaultProjectId);
    }
  }, [projectContext, defaultProjectId]);

  const resetInline = () => {
    setInline(emptyInline(projectContext ? defaultProjectId || filterProjectId : undefined));
  };

  const saveInline = async () => {
    if (!canCreatePeV) return;
    if (!inline.projectId) {
      showToast('Select a project.', 'warning');
      return;
    }
    if (!inline.expenseCategoryId) {
      showToast('Select an expense category.', 'warning');
      return;
    }
    if (!inline.paymentSourceAccountId) {
      showToast('Select a bank account.', 'warning');
      return;
    }
    const amount = parseFloat(inline.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a positive amount.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await pevApi.create({
        voucherDate: inline.voucherDate,
        projectId: inline.projectId,
        expenseCategoryId: inline.expenseCategoryId,
        vendorId: inline.vendorId || undefined,
        paymentSourceAccountId: inline.paymentSourceAccountId,
        amount,
        description: inline.description.trim() || undefined,
      });
      showToast('Expense saved.', 'success');
      resetInline();
      await loadData();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setSaving(false);
    }
  };

  const removeExpense = async (v: ProjectExpenseVoucher) => {
    if (!canCreatePeV) return;
    if (!confirm(`Delete expense ${v.voucherNumber}? This reverses the GL entry.`)) return;
    try {
      await pevApi.delete(v.id, v.version);
      showToast('Expense deleted.', 'success');
      await loadData();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    }
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const vendorName = (id?: string) => (id ? vendors.find((v) => v.id === id)?.name ?? id : '—');
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  if (!canReadPeV) {
    return (
      <Card className="p-6">
        <p className="text-app-muted">You do not have permission to view project expenses.</p>
      </Card>
    );
  }

  const cellInput =
    'w-full min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs bg-app-card shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-app-text">Petty Cash</h2>
        <p className="text-sm text-app-muted mt-1">
          Record site expenses paid from bank or petty cash. Categories come from Settings → Chart of Accounts.
          Saves immediately to the project and deducts the selected bank/cash account.
        </p>
      </div>

      <Card className="p-4">
        {!projectContext && (
          <div className="mb-4 max-w-xs">
            <label className="text-xs text-app-muted block mb-1">Filter by project</label>
            <ComboBox
              items={projectFilterItems}
              selectedId={filterProjectId}
              onSelect={(item) => setFilterProjectId(item?.id || 'all')}
              placeholder="All projects"
              allowAddNew={false}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-app-border text-left text-app-muted text-xs uppercase tracking-wide">
                <th className="py-2 pr-2 w-28">Date</th>
                <th className="py-2 pr-2 min-w-[140px]">Project</th>
                <th className="py-2 pr-2 min-w-[120px]">Vendor</th>
                <th className="py-2 pr-2 min-w-[140px]">Category</th>
                <th className="py-2 pr-2 w-24 text-right">Amount</th>
                <th className="py-2 pr-2 min-w-[140px]">Bank Account</th>
                <th className="py-2 pr-2 min-w-[160px]">Note</th>
                <th className="py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {canCreatePeV && (
                <tr className="border-b border-app-border bg-app-hover/30">
                  <td className="py-2 pr-2 align-middle">
                    <DatePicker
                      compact
                      value={inline.voucherDate}
                      onChange={(d) => setInline((f) => ({ ...f, voucherDate: toLocalDateString(d) }))}
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <ComboBox
                      items={projects}
                      selectedId={inline.projectId}
                      onSelect={(item) => setInline((f) => ({ ...f, projectId: item?.id || '' }))}
                      placeholder="Project"
                      allowAddNew={false}
                      compact
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <ComboBox
                      items={vendorItems}
                      selectedId={inline.vendorId}
                      onSelect={(item) => setInline((f) => ({ ...f, vendorId: item?.id || '' }))}
                      placeholder="Optional"
                      allowAddNew={false}
                      compact
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <ComboBox
                      items={categoryItems}
                      selectedId={inline.expenseCategoryId}
                      onSelect={(item) => setInline((f) => ({ ...f, expenseCategoryId: item?.id || '' }))}
                      placeholder="Expense category"
                      entityType="category"
                      allowAddNew={canCreatePeV}
                      compact
                      onAddNew={(_entityType, name) => {
                        entityFormModal.openForm(
                          'category',
                          name,
                          undefined,
                          TransactionType.EXPENSE,
                          (newId) => setInline((f) => ({ ...f, expenseCategoryId: newId }))
                        );
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={`${cellInput} text-right`}
                      placeholder="0"
                      value={inline.amount}
                      onChange={(e) => setInline((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <ComboBox
                      items={bankAccounts.map((a) => ({ id: a.id, name: a.name }))}
                      selectedId={inline.paymentSourceAccountId}
                      onSelect={(item) =>
                        setInline((f) => ({ ...f, paymentSourceAccountId: item?.id || '' }))
                      }
                      placeholder="Bank / cash"
                      allowAddNew={false}
                      compact
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <input
                      type="text"
                      className={cellInput}
                      placeholder="Note"
                      value={inline.description}
                      onChange={(e) => setInline((f) => ({ ...f, description: e.target.value }))}
                    />
                  </td>
                  <td className="py-2 align-middle">
                    <Button size="sm" onClick={saveInline} disabled={saving}>
                      {saving ? '…' : 'Save'}
                    </Button>
                  </td>
                </tr>
              )}

              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-app-muted">
                    Loading…
                  </td>
                </tr>
              ) : vouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-app-muted">
                    No expenses yet. Use the row above to add one.
                  </td>
                </tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id} className="border-b border-app-border/50 hover:bg-app-hover/40">
                    <td className="py-2 pr-2 whitespace-nowrap">{v.voucherDate}</td>
                    <td className="py-2 pr-2">{projectName(v.projectId)}</td>
                    <td className="py-2 pr-2">{vendorName(v.vendorId)}</td>
                    <td className="py-2 pr-2">{categoryName(v.expenseCategoryId)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {CURRENCY} {v.amount.toLocaleString()}
                    </td>
                    <td className="py-2 pr-2">{accountName(v.paymentSourceAccountId)}</td>
                    <td className="py-2 pr-2 text-app-muted">{v.description || '—'}</td>
                    <td className="py-2">
                      {canCreatePeV && (
                        <Button size="sm" variant="ghost" onClick={() => removeExpense(v)}>
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {expenseCategories.length === 0 && canCreatePeV && (
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-4">
            No expense categories yet. Type a name in the Category field to add one, or create categories in{' '}
            <strong>Settings → Chart of Accounts</strong>.
          </p>
        )}
      </Card>

      <EntityFormModal
        isOpen={entityFormModal.isFormOpen}
        formType={entityFormModal.formType}
        initialName={entityFormModal.initialName}
        contactType={entityFormModal.contactType}
        categoryType={entityFormModal.categoryType}
        onClose={entityFormModal.closeForm}
        onSubmit={entityFormModal.handleSubmit}
      />
    </div>
  );
};

export default ProjectExpenseVouchersPage;
