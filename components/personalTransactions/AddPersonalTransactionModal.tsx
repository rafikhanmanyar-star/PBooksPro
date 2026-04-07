import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { useAppContext } from '../../context/AppContext';
import { AccountType } from '../../types';
import { getPersonalIncomeCategories, getPersonalExpenseCategories, addPersonalCategory } from './personalCategoriesService';
import { addPersonalTransaction } from './personalTransactionsService';
import { CURRENCY } from '../../constants';
import { toLocalDateString } from '../../utils/dateUtils';

const STEPS = [
  { id: 1, title: 'Type & account', key: 'type-account' },
  { id: 2, title: 'Category & amount', key: 'category-amount' },
  { id: 3, title: 'Date & description', key: 'date-description' },
  { id: 4, title: 'Review', key: 'review' },
] as const;

const TOTAL_STEPS = STEPS.length;

interface AddPersonalTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const AddPersonalTransactionModal: React.FC<AddPersonalTransactionModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const { state } = useAppContext();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'Income' | 'Expense'>('Expense');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    () => toLocalDateString(new Date())
  );
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categoryListKey, setCategoryListKey] = useState(0);
  const [categoryHighlightedIndex, setCategoryHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setTransactionDate(toLocalDateString(new Date()));
    }
  }, [isOpen]);

  const bankAndCashAccounts = useMemo(
    () =>
      state.accounts
        .filter(
          (a) =>
            (a.type === AccountType.BANK || a.type === AccountType.CASH) &&
            a.name !== 'Internal Clearing'
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.accounts]
  );

  const incomeCategories = useMemo(
    () => getPersonalIncomeCategories(),
    [categoryListKey, state.personalCategories]
  );
  const expenseCategories = useMemo(
    () => getPersonalExpenseCategories(),
    [categoryListKey, state.personalCategories]
  );
  const categories = type === 'Income' ? incomeCategories : expenseCategories;

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const exactMatch = useMemo(
    () => categories.find((c) => c.name.toLowerCase() === categorySearch.trim().toLowerCase()),
    [categories, categorySearch]
  );
  const showAddNewOption = categorySearch.trim() && !exactMatch;

  const accountName = useMemo(
    () => bankAndCashAccounts.find((a) => a.id === accountId)?.name ?? '',
    [bankAndCashAccounts, accountId]
  );
  const categoryName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.name ?? '',
    [categories, categoryId]
  );

  const transactionLineParts = useMemo(() => {
    const parts: string[] = [];
    if (step >= 1) parts.push(type);
    if (step >= 1 && accountName) parts.push(accountName);
    if (step >= 2 && categoryName) parts.push(categoryName);
    if (step >= 2 && amount) {
      const num = parseFloat(amount);
      if (!isNaN(num))
        parts.push(`${CURRENCY === 'PKR' ? 'Rs ' : '$'}${num.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
    if (step >= 3 && transactionDate) parts.push(transactionDate);
    if (step >= 3 && description.trim()) parts.push(description.trim());
    return parts;
  }, [step, type, accountName, categoryName, amount, transactionDate, description]);

  useEffect(() => {
    if (step === 2 && categoryId) {
      const name = categories.find((c) => c.id === categoryId)?.name ?? '';
      setCategorySearch(name);
    }
  }, [step, categoryId, categories]);

  useEffect(() => {
    if (categoryDropdownOpen) {
      const idx = filteredCategories.findIndex((c) => c.id === categoryId);
      setCategoryHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setCategoryHighlightedIndex(-1);
    }
  }, [categoryDropdownOpen, categoryId, filteredCategories]);

  const resetForm = () => {
    setStep(1);
    setType('Expense');
    setAccountId('');
    setCategoryId('');
    setCategorySearch('');
    setCategoryDropdownOpen(false);
    setAmount('');
    setTransactionDate(toLocalDateString(new Date()));
    setDescription('');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateStep = async (): Promise<boolean> => {
    setError('');
    switch (step) {
      case 1:
        if (!accountId) {
          setError('Please select an account.');
          return false;
        }
        return true;
      case 2: {
        const name = categorySearch.trim();
        if (!categoryId && !name) {
          setError('Please select or type a category.');
          return false;
        }
        if (categoryId) {
          const num = parseFloat(amount);
          if (amount.trim() === '' || isNaN(num) || num <= 0) {
            setError('Please enter a valid amount greater than 0.');
            return false;
          }
          return true;
        }
        try {
          const created = await addPersonalCategory(type, name);
          setCategoryId(created.id);
          setCategoryListKey((k) => k + 1);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Invalid category name.');
          return false;
        }
        const num = parseFloat(amount);
        if (amount.trim() === '' || isNaN(num) || num <= 0) {
          setError('Please enter a valid amount greater than 0.');
          return false;
        }
        return true;
      }
      case 3:
        if (!transactionDate.trim()) {
          setError('Please select a date.');
          return false;
        }
        return true;
      case 4:
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (!(await validateStep())) return;
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    if (step > 1) setStep(step - 1);
  };

  const handleSave = async () => {
    setError('');
    const numAmount = parseFloat(amount);
    if (!accountId || !categoryId || !transactionDate || isNaN(numAmount) || numAmount <= 0) {
      setError('Please complete all required fields.');
      return;
    }
    setSaving(true);
    try {
      await addPersonalTransaction({
        accountId,
        personalCategoryId: categoryId,
        type,
        amount: numAmount,
        transactionDate,
        description: description.trim() || undefined,
      });
      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return;
    const tag = el.tagName;
    if (tag === 'BUTTON') return;
    const isField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (isField || step === TOTAL_STEPS) {
      e.preventDefault();
      if (step < TOTAL_STEPS) {
        if (isField) handleNext();
      } else {
        handleSave();
      }
    }
  };

  const selectCategoryByIndex = async (index: number) => {
    if (showAddNewOption && index === filteredCategories.length) {
      try {
        const created = await addPersonalCategory(type, categorySearch.trim());
        setCategoryId(created.id);
        setCategorySearch(created.name);
        setCategoryListKey((k) => k + 1);
        setCategoryDropdownOpen(false);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add category.');
      }
      return;
    }
    const cat = filteredCategories[index];
    if (cat) {
      setCategoryId(cat.id);
      setCategorySearch(cat.name);
      setCategoryDropdownOpen(false);
      setError('');
    }
  };

  const handleCategoryInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!categoryDropdownOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIdx = showAddNewOption ? filteredCategories.length : Math.max(0, filteredCategories.length - 1);
      setCategoryHighlightedIndex((i) => Math.min(i + 1, maxIdx));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCategoryHighlightedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (categoryHighlightedIndex >= 0) {
        selectCategoryByIndex(categoryHighlightedIndex);
      } else if (filteredCategories.length > 0) {
        selectCategoryByIndex(0);
      } else if (showAddNewOption) {
        selectCategoryByIndex(filteredCategories.length);
      }
      return;
    }
    if (e.key === 'Escape') {
      setCategoryDropdownOpen(false);
      setCategoryHighlightedIndex(-1);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="add-txn-type" className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                id="add-txn-type"
                value={type}
                onChange={(e) => {
                  const v = e.target.value as 'Income' | 'Expense';
                  setType(v);
                  setCategoryId('');
                  setCategorySearch('');
                  setError('');
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                aria-label="Transaction type"
                autoFocus
              >
                <option value="Expense">Expense — money going out</option>
                <option value="Income">Income — money coming in</option>
              </select>
            </div>
            <div>
              <label htmlFor="add-txn-account" className="block text-sm font-medium text-gray-700 mb-1">
                Account
              </label>
              <select
                id="add-txn-account"
                value={accountId}
                onChange={(e) => { setAccountId(e.target.value); setError(''); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                aria-label="Account"
              >
                <option value="">Select account</option>
                {bankAndCashAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
              {bankAndCashAccounts.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No bank/cash accounts found. Create one in Settings → Financial → Chart of Accounts.
                </p>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4 relative">
            <div>
              <label htmlFor="add-txn-category" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <input
                id="add-txn-category"
                type="text"
                value={categorySearch}
                onChange={(e) => {
                  setCategorySearch(e.target.value);
                  setCategoryDropdownOpen(true);
                  if (!e.target.value) setCategoryId('');
                  setError('');
                }}
                onFocus={() => setCategoryDropdownOpen(true)}
                onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 200)}
                onKeyDown={handleCategoryInputKeyDown}
                placeholder="Type to search or add new category"
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                autoFocus
                autoComplete="off"
              />
            </div>
            {categoryDropdownOpen && (
              <div
                className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                role="listbox"
                aria-activedescendant={categoryHighlightedIndex >= 0 ? `cat-opt-${categoryHighlightedIndex}` : undefined}
              >
                {filteredCategories.length === 0 && !showAddNewOption && (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {categorySearch.trim() ? 'No match. Type to add as new.' : 'Type to search categories.'}
                  </div>
                )}
                {filteredCategories.map((cat, idx) => (
                  <div
                    key={cat.id}
                    id={`cat-opt-${idx}`}
                    role="option"
                    aria-selected={categoryId === cat.id}
                    className={`w-full text-left px-3 py-2.5 text-sm cursor-pointer ${categoryHighlightedIndex === idx ? 'bg-green-100 text-green-900' : categoryId === cat.id ? 'bg-green-50 text-green-800' : 'hover:bg-gray-100'}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCategoryId(cat.id);
                      setCategorySearch(cat.name);
                      setCategoryDropdownOpen(false);
                      setError('');
                    }}
                  >
                    {cat.name}
                  </div>
                ))}
                {showAddNewOption && (
                  <div
                    id={`cat-opt-${filteredCategories.length}`}
                    role="option"
                    className={`w-full text-left px-3 py-2.5 text-sm cursor-pointer font-medium border-t border-gray-100 ${categoryHighlightedIndex === filteredCategories.length ? 'bg-green-100 text-green-900' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectCategoryByIndex(filteredCategories.length);
                    }}
                  >
                    + Add &quot;{categorySearch.trim()}&quot; as new category
                  </div>
                )}
              </div>
            )}
            <div>
              <label htmlFor="add-txn-amount" className="block text-sm font-medium text-gray-700 mb-1">
                Amount ({CURRENCY})
              </label>
              <Input
                id="add-txn-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                placeholder="0.00"
                className="text-lg w-full"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <DatePicker
                id="add-txn-date"
                label="Date"
                value={transactionDate}
                onChange={(d) => { setTransactionDate(toLocalDateString(d)); setError(''); }}
                className="text-base w-full"
              />
            </div>
            <div>
              <label htmlFor="add-txn-desc" className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <Input
                id="add-txn-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Amazon, Grocery store, Salary"
                className="text-base w-full"
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-700">Review your transaction</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Type</dt>
                <dd className="font-medium">{type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Account</dt>
                <dd className="font-medium">{accountName || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Category</dt>
                <dd className="font-medium">{categoryName || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Amount</dt>
                <dd className="font-medium">{amount ? `${CURRENCY === 'PKR' ? 'Rs ' : '$'}${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Date</dt>
                <dd className="font-medium">{transactionDate || '—'}</dd>
              </div>
              {description.trim() && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Description</dt>
                  <dd className="font-medium">{description.trim()}</dd>
                </div>
              )}
            </dl>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add transaction" size="md">
      <div className="space-y-6" onKeyDown={handleKeyDown}>
        {/* Step indicator */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  s.id === step
                    ? 'bg-green-600 text-white'
                    : s.id < step
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-500'
                }`}
                title={s.title}
              >
                {s.id}
              </div>
            ))}
          </div>
          <span className="text-sm text-gray-500">
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>
        <div className="text-sm font-medium text-gray-700">
          {STEPS[step - 1].title}
        </div>

        {transactionLineParts.length > 0 && (
          <div
            className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono"
            title="Transaction so far"
          >
            <span className="text-gray-500 mr-2">Transaction:</span>
            {transactionLineParts.join(' • ')}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {renderStepContent()}

        <div className="flex gap-2 justify-between pt-2 border-t border-gray-200">
          <div>
            {step > 1 ? (
              <Button type="button" variant="secondary" onClick={handleBack} disabled={saving}>
                Back
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
          <div>
            {step < TOTAL_STEPS ? (
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save transaction'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AddPersonalTransactionModal;
