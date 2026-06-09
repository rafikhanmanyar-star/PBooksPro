import React, { useCallback, useEffect, useState } from 'react';
import type { Account, ProjectExpenseCategory } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { ProjectExpenseCategoryApiRepository } from '../../services/api/repositories/projectExpenseVoucherApi';
import { useNotification } from '../../context/NotificationContext';
import { formatApiErrorMessage } from '../../services/api/client';
import { usePermissions } from '../../hooks/usePermissions';

const catApi = new ProjectExpenseCategoryApiRepository();

interface ProjectExpenseCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
}

const ProjectExpenseCategoriesModal: React.FC<ProjectExpenseCategoriesModalProps> = ({
  isOpen,
  onClose,
  accounts,
}) => {
  const { showToast, showAlert } = useNotification();
  const { canCreatePeV } = usePermissions();
  const [categories, setCategories] = useState<ProjectExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Partial<ProjectExpenseCategory>>({ isActive: true });
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      setCategories(await catApi.findAll());
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setLoading(false);
    }
  }, [isOpen, showAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({ isActive: true });
    setEditingId(null);
  };

  const save = async () => {
    if (!canCreatePeV) return;
    if (!form.name?.trim()) {
      showToast('Category name is required.', 'warning');
      return;
    }
    if (!form.glAccountId) {
      showToast('GL account mapping is required.', 'warning');
      return;
    }
    try {
      if (editingId) {
        await catApi.update(editingId, { ...form, id: editingId });
        showToast('Category updated.', 'success');
      } else {
        await catApi.create(form);
        showToast('Category created.', 'success');
      }
      resetForm();
      await load();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    }
  };

  const startEdit = (c: ProjectExpenseCategory) => {
    setEditingId(c.id);
    setForm({ ...c });
  };

  const remove = async (c: ProjectExpenseCategory) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await catApi.delete(c.id, c.version);
      showToast('Category deleted.', 'success');
      await load();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Project Expense Categories" size="lg">
      <p className="text-sm text-app-muted mb-4">
        Map each expense category to a GL expense account. Posted vouchers debit this account and credit the payment source.
      </p>

      {canCreatePeV && (
        <div className="border border-app-border rounded-lg p-4 mb-4 space-y-3 bg-app-hover/30">
          <h4 className="font-medium text-sm">{editingId ? 'Edit Category' : 'Add Category'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="Category name (e.g. Fuel)"
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <ComboBox
              items={accounts.map((a) => ({ id: a.id, name: a.name }))}
              selectedId={form.glAccountId || ''}
              onSelect={(id) => setForm((f) => ({ ...f, glAccountId: id || undefined }))}
              placeholder="GL expense account"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex gap-2">
            <Button onClick={save}>{editingId ? 'Update' : 'Add'}</Button>
            {editingId && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-app-muted text-center py-4">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-app-muted">
              <th className="py-2">Name</th>
              <th className="py-2">GL Account</th>
              <th className="py-2">Active</th>
              {canCreatePeV && <th className="py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-app-border/50">
                <td className="py-2">{c.name}</td>
                <td className="py-2">{accounts.find((a) => a.id === c.glAccountId)?.name ?? c.glAccountId}</td>
                <td className="py-2">{c.isActive ? 'Yes' : 'No'}</td>
                {canCreatePeV && (
                  <td className="py-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                      Delete
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
};

export default ProjectExpenseCategoriesModal;
