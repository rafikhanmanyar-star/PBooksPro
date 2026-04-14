import React, { useState, useMemo, useEffect, useCallback, useTransition, memo } from 'react';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { Page } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import { useDebounce } from '../../hooks/useDebounce';
import { buildSearchRows, type BuiltSearchRow } from './searchModalResults';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
}

const SearchResultButton = memo(function SearchResultButton({
  row,
  onPick,
}: {
  row: BuiltSearchRow;
  onPick: (row: BuiltSearchRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(row)}
      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
    >
      <div className="font-medium text-gray-900">{row.title}</div>
      {row.subtitle && <div className="text-sm text-gray-500 mt-1">{row.subtitle}</div>}
      <div className="text-xs text-gray-400 mt-1">{row.type}</div>
    </button>
  );
});

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, currentPage }) => {
  const dispatch = useDispatchOnly();
  const transactions = useStateSelector((s) => s.transactions);
  const accounts = useStateSelector((s) => s.accounts);
  const categories = useStateSelector((s) => s.categories);
  const contacts = useStateSelector((s) => s.contacts);
  const bills = useStateSelector((s) => s.bills);
  const contracts = useStateSelector((s) => s.contracts);
  const vendors = useStateSelector((s) => s.vendors);
  const projectAgreements = useStateSelector((s) => s.projectAgreements);
  const rentalAgreements = useStateSelector((s) => s.rentalAgreements);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 280);
  const [searchRows, setSearchRows] = useState<BuiltSearchRow[]>([]);
  const [, startSearchTransition] = useTransition();
  const [, startPickTransition] = useTransition();

  const accountById = useMemo(() => {
    const m = new Map<string, { name?: string }>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  const categoryById = useMemo(() => {
    const m = new Map<string, { name?: string }>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const contactById = useMemo(() => {
    const m = new Map<string, (typeof contacts)[0]>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const vendorById = useMemo(() => {
    const m = new Map<string, { name?: string }>();
    for (const v of vendors ?? []) {
      if (v?.id) m.set(v.id, v);
    }
    return m;
  }, [vendors]);

  const contractById = useMemo(() => {
    const m = new Map<string, (typeof contracts)[0]>();
    for (const x of contracts) m.set(x.id, x);
    return m;
  }, [contracts]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchRows([]);
      return;
    }
    const t = window.setTimeout(() => {
      const input = document.getElementById('search-modal-input');
      input?.focus();
    }, 100);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const raw = debouncedSearch.trim();
    startSearchTransition(() => {
      if (!raw) {
        setSearchRows([]);
        return;
      }
      const rows = buildSearchRows(raw, {
        currentPage,
        transactions,
        bills,
        contracts,
        contractById,
        projectAgreements,
        rentalAgreements,
        contacts,
        accountById,
        categoryById,
        contactById,
        vendorById,
      });
      setSearchRows(rows);
    });
  }, [
    isOpen,
    debouncedSearch,
    currentPage,
    transactions,
    bills,
    contracts,
    contractById,
    projectAgreements,
    rentalAgreements,
    contacts,
    accountById,
    categoryById,
    contactById,
    vendorById,
    startSearchTransition,
  ]);

  const handlePick = useCallback(
    (row: BuiltSearchRow) => {
      startPickTransition(() => {
        if (row.session) {
          sessionStorage.setItem(row.session.key, row.session.value);
        }
        if (row.editing) {
          dispatch({ type: 'SET_EDITING_ENTITY', payload: { type: row.editing.type, id: row.editing.id } });
        }
        dispatch({ type: 'SET_PAGE', payload: row.page });
        onClose();
      });
    },
    [dispatch, onClose, startPickTransition]
  );

  const getSearchPlaceholder = useCallback(() => {
    switch (currentPage) {
      case 'transactions':
        return 'Search transactions...';
      case 'bills':
        return 'Search bills...';
      case 'projectManagement':
        return 'Search contracts and agreements...';
      case 'rentalAgreements':
        return 'Search rental agreements...';
      case 'vendorDirectory':
        return 'Search vendors...';
      case 'contacts':
        return 'Search contacts...';
      default:
        return 'Search...';
    }
  }, [currentPage]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search" size="lg">
      <div className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <span className="h-5 w-5">{ICONS.search}</span>
          </div>
          <Input
            id="search-modal-input"
            placeholder={getSearchPlaceholder()}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-10 ${searchQuery ? 'pr-10' : ''}`}
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
              type="button"
              aria-label="Clear search"
            >
              <span className="h-5 w-5">{ICONS.x}</span>
            </button>
          )}
        </div>

        {searchRows.length > 0 ? (
          <div className="max-h-96 overflow-y-auto space-y-2 min-h-[120px]">
            {searchRows.map((row) => (
              <SearchResultButton key={row.id} row={row} onPick={handlePick} />
            ))}
          </div>
        ) : debouncedSearch.trim() ? (
          <div className="text-center py-8 text-gray-500 min-h-[120px]">No results found for &quot;{debouncedSearch}&quot;</div>
        ) : (
          <div className="text-center py-8 text-gray-400 min-h-[120px]">Start typing to search...</div>
        )}
      </div>
    </Modal>
  );
};

export default memo(SearchModal);
