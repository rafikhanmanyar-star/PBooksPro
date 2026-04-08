import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import {
  PersonalCategory,
  getPersonalIncomeCategories,
  getPersonalExpenseCategories,
  setPersonalIncomeCategories,
  setPersonalExpenseCategories,
  replacePersonalCategoriesApi,
} from './personalCategoriesService';
import { ICONS } from '../../constants';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useAppContext } from '../../context/AppContext';
import { useOffline } from '../../context/OfflineContext';
import { useNotification } from '../../context/NotificationContext';

type CategoryKind = 'Income' | 'Expense';

interface Row extends PersonalCategory {
  type: CategoryKind;
}

function generateId(prefix: string, name: string): string {
  const slug = name.trim().replace(/\s+/g, '-').toLowerCase() || 'item';
  return `${prefix}-${Date.now()}-${slug}`;
}

function notifyPersonalCategoriesChanged(): void {
  window.dispatchEvent(new CustomEvent('pbooks-personal-categories-changed'));
}

type TypeFilter = 'all' | CategoryKind;

type SortKey = 'name' | 'type';
type SortDir = 'asc' | 'desc';

type EditorState =
  | { open: false }
  | { open: true; mode: 'add'; categoryType: CategoryKind }
  | { open: true; mode: 'edit'; categoryType: CategoryKind; category: PersonalCategory };

/**
 * Chart-of-accounts-style management for personal income/expense categories only (no bank accounts).
 */
const PersonalCategoriesSettingsPanel: React.FC = () => {
  const { state } = useAppContext();
  const { isOffline } = useOffline();
  const { showConfirm, showToast } = useNotification();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDir }>({
    key: 'name',
    direction: 'asc',
  });
  const [listVersion, setListVersion] = useState(0);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [formName, setFormName] = useState('');

  const editsDisabled = isOffline && !isLocalOnlyMode();

  const bumpList = useCallback(() => {
    setListVersion((v) => v + 1);
    notifyPersonalCategoriesChanged();
  }, []);

  const mergedRows = useMemo((): Row[] => {
    const inc = getPersonalIncomeCategories().map((c) => ({ ...c, type: 'Income' as const }));
    const exp = getPersonalExpenseCategories().map((c) => ({ ...c, type: 'Expense' as const }));
    return [...inc, ...exp];
  }, [listVersion, state.personalCategories]);

  const filteredSorted = useMemo(() => {
    let data = mergedRows;
    if (typeFilter !== 'all') {
      data = data.filter((r) => r.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter((r) => r.name.toLowerCase().includes(q));
    }
    const copy = [...data];
    copy.sort((a, b) => {
      const key = sortConfig.key;
      const av = a[key];
      const bv = b[key];
      const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : String(av).localeCompare(String(bv));
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [mergedRows, typeFilter, searchQuery, sortConfig]);

  useEffect(() => {
    if (!editor.open) return;
    if (editor.mode === 'add') {
      setFormName('');
    } else {
      setFormName(editor.category.name);
    }
  }, [editor]);

  const persistType = useCallback(
    async (kind: CategoryKind, next: PersonalCategory[]): Promise<boolean> => {
      try {
        if (isLocalOnlyMode()) {
          if (kind === 'Income') setPersonalIncomeCategories(next);
          else setPersonalExpenseCategories(next);
        } else {
          await replacePersonalCategoriesApi(kind, next);
        }
        bumpList();
        return true;
      } catch (e: unknown) {
        bumpList();
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Could not save categories.';
        showToast(msg, 'error');
        return false;
      }
    },
    [bumpList, showToast]
  );

  const handleSaveEditor = async () => {
    if (!editor.open) return;
    const name = formName.trim();
    if (!name) return;

    let ok = false;
    if (editor.mode === 'add') {
      const prefix = editor.categoryType === 'Income' ? 'personal-inc' : 'personal-exp';
      const newCat: PersonalCategory = { id: generateId(prefix, name), name };
      const others =
        editor.categoryType === 'Income' ? getPersonalIncomeCategories() : getPersonalExpenseCategories();
      ok = await persistType(editor.categoryType, [...others, newCat]);
    } else {
      const { category, categoryType } = editor;
      const list =
        categoryType === 'Income' ? getPersonalIncomeCategories() : getPersonalExpenseCategories();
      const updated = list.map((c) => (c.id === category.id ? { ...c, name } : c));
      ok = await persistType(categoryType, updated);
    }
    if (ok) setEditor({ open: false });
  };

  const handleDelete = async (row: Row) => {
    if (editsDisabled) return;
    const ok = await showConfirm(`Delete category "${row.name}"?`, {
      title: 'Delete category',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    const list = row.type === 'Income' ? getPersonalIncomeCategories() : getPersonalExpenseCategories();
    await persistType(row.type, list.filter((c) => c.id !== row.id));
  };

  const openAdd = (categoryType: CategoryKind) => {
    setIsAddMenuOpen(false);
    setEditor({ open: true, mode: 'add', categoryType });
  };

  const openEdit = (row: Row) => {
    if (editsDisabled) return;
    setEditor({ open: true, mode: 'edit', categoryType: row.type, category: { id: row.id, name: row.name } });
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortHeader: React.FC<{ label: string; sortKey: SortKey }> = ({ label, sortKey }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors select-none sticky top-0 bg-white z-10 border-b border-slate-200"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        {sortConfig.key === sortKey && (
          <span className="text-indigo-600 font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  const editorTitle =
    editor.open && editor.mode === 'add'
      ? `New ${editor.categoryType} category`
      : editor.open
        ? 'Edit category'
        : '';

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {editsDisabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Category changes are disabled while offline. You can still view this list.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Personal categories</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-2xl">
            Manage income and expense categories used only for Personal transactions. They are separate from Chart of Accounts
            categories in Settings.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <div className="relative group">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search categories..."
              className="w-full sm:w-64 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all rounded-lg pl-10"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <div className="w-4 h-4">{ICONS.fileText}</div>
            </div>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <div className="w-4 h-4">{ICONS.x}</div>
              </button>
            ) : null}
          </div>
          <div className="relative">
            <Button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              disabled={editsDisabled}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 border-0 rounded-lg px-4 py-2.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
            >
              <div className="w-5 h-5">{ICONS.plus}</div>
              <span className="font-semibold">Add New</span>
              <div className="w-4 h-4">{ICONS.chevronDown}</div>
            </Button>
            {isAddMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAddMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-600 z-50 py-1">
                  <button
                    type="button"
                    onClick={() => openAdd('Income')}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-2 transition-colors"
                  >
                    <div className="w-4 h-4">{ICONS.arrowUp}</div>
                    <span>Income category</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdd('Expense')}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-2 transition-colors"
                  >
                    <div className="w-4 h-4">{ICONS.arrowDown}</div>
                    <span>Expense category</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 shrink-0">
        {(
          [
            { id: 'all' as const, label: 'All' },
            { id: 'Income' as const, label: 'Income' },
            { id: 'Expense' as const, label: 'Expense' },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTypeFilter(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              typeFilter === id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
          <div className="overflow-x-auto flex-grow min-h-0">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700">
              <thead className="bg-white dark:bg-slate-900/40">
                <tr>
                  <SortHeader label="Name" sortKey="name" />
                  <SortHeader label="Type" sortKey="type" />
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-white dark:bg-slate-900/40 z-10 border-b border-slate-200 dark:border-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900/20 divide-y divide-slate-50 dark:divide-slate-800">
                {filteredSorted.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`transition-colors duration-200 group hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 ${
                      index % 2 !== 0 ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-200 font-medium">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                          row.type === 'Income'
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          disabled={editsDisabled}
                          className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Edit"
                        >
                          <div className="w-4 h-4">{ICONS.edit}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          disabled={editsDisabled}
                          className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          <div className="w-4 h-4">{ICONS.trash}</div>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSorted.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-12 text-center text-slate-400">
                      No categories found. Add one with Add New, or adjust filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={editor.open}
        onClose={() => setEditor({ open: false })}
        title={editorTitle}
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveEditor();
          }}
        >
          <Input
            label="Category name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Salary, Groceries"
            autoFocus
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditor({ open: false })}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formName.trim() || editsDisabled}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PersonalCategoriesSettingsPanel;
