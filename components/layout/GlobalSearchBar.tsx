import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useTransition,
  memo,
  useRef,
} from 'react';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import { useDebounce } from '../../hooks/useDebounce';
import { buildSearchRows, type BuiltSearchRow } from './searchModalResults';

interface GlobalSearchBarProps {
  autoFocus?: boolean;
  onClose?: () => void;
  className?: string;
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
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-app-table-hover transition-colors border-b border-app-border last:border-b-0"
    >
      <div className="font-medium text-app-text text-sm">{row.title}</div>
      {row.subtitle && <div className="text-xs text-app-muted mt-0.5">{row.subtitle}</div>}
      <div className="text-[10px] text-app-muted/80 mt-1 uppercase tracking-wide">{row.type}</div>
    </button>
  );
});

export const openSettingsCategory = (categoryId: string) => {
  sessionStorage.setItem('openSettingsCategory', categoryId);
  window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { categoryId } }));
};

export const navigateToSearchResult = (
  row: BuiltSearchRow,
  dispatch: ReturnType<typeof useDispatchOnly>
) => {
  if (row.session) {
    sessionStorage.setItem(row.session.key, row.session.value);
  }
  if (row.settingsCategory) {
    openSettingsCategory(row.settingsCategory);
  }
  if (row.editing) {
    dispatch({ type: 'SET_EDITING_ENTITY', payload: { type: row.editing.type, id: row.editing.id } });
  }
  dispatch({ type: 'SET_PAGE', payload: row.page });
  if (row.initialTabs?.length) {
    dispatch({ type: 'SET_INITIAL_TABS', payload: row.initialTabs });
  }
};

const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  autoFocus = false,
  onClose,
  className = '',
}) => {
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
  const projects = useStateSelector((s) => s.projects);
  const buildings = useStateSelector((s) => s.buildings);
  const properties = useStateSelector((s) => s.properties);
  const units = useStateSelector((s) => s.units);

  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 220);
  const [searchRows, setSearchRows] = useState<BuiltSearchRow[]>([]);
  const [, startSearchTransition] = useTransition();
  const [, startPickTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const focusInput = useCallback(() => {
    const input = document.getElementById('global-search-input') as HTMLInputElement | null;
    input?.focus();
  }, []);

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

  const showDropdown = isFocused && (searchQuery.trim().length > 0 || debouncedSearch.trim().length > 0);

  useEffect(() => {
    const raw = debouncedSearch.trim();
    startSearchTransition(() => {
      if (!raw) {
        setSearchRows([]);
        return;
      }
      const rows = buildSearchRows(raw, {
        transactions,
        bills,
        contracts,
        contractById,
        projectAgreements,
        rentalAgreements,
        contacts,
        accounts,
        categories,
        projects,
        buildings,
        properties,
        units,
        accountById,
        categoryById,
        contactById,
        vendorById,
      });
      setSearchRows(rows);
    });
  }, [
    debouncedSearch,
    transactions,
    bills,
    contracts,
    contractById,
    projectAgreements,
    rentalAgreements,
    contacts,
    accounts,
    categories,
    projects,
    buildings,
    properties,
    units,
    accountById,
    categoryById,
    contactById,
    vendorById,
    startSearchTransition,
  ]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(focusInput, 50);
    return () => clearTimeout(t);
  }, [autoFocus, focusInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchQuery('');
        setIsFocused(false);
        (document.getElementById('global-search-input') as HTMLInputElement | null)?.blur();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePick = useCallback(
    (row: BuiltSearchRow) => {
      startPickTransition(() => {
        navigateToSearchResult(row, dispatch);
        setSearchQuery('');
        setIsFocused(false);
        onClose?.();
      });
    },
    [dispatch, onClose, startPickTransition]
  );

  const handleClear = useCallback(() => {
    setSearchQuery('');
    focusInput();
  }, [focusInput]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <Input
          id="global-search-input"
          icon={
            <span className="text-app-muted h-4 w-4 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
              {ICONS.search}
            </span>
          }
          placeholder="Search pages, reports, contacts, accounts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          className={`block w-full border rounded-xl text-sm bg-app-card border-app-border placeholder:text-app-muted/80 text-app-text focus:outline-none focus:ring-2 focus:ring-ds-primary/35 focus:border-ds-primary py-2 ${searchQuery ? 'pr-9' : ''}`}
          autoComplete="off"
          aria-label="Search the app"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-app-muted hover:text-app-text transition-colors z-10"
            type="button"
            aria-label="Clear search"
          >
            <span className="h-4 w-4 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{ICONS.x}</span>
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          id="global-search-results"
          className="absolute top-full left-0 right-0 mt-2 bg-app-modal border border-app-border rounded-xl shadow-xl overflow-hidden z-50"
        >
          {searchRows.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {searchRows.map((row) => (
                <SearchResultButton key={row.id} row={row} onPick={handlePick} />
              ))}
            </div>
          ) : debouncedSearch.trim() ? (
            <div className="text-center py-6 text-sm text-app-muted px-4">
              No results for &quot;{debouncedSearch}&quot;
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-app-muted px-4">
              Search modules, reports, contacts, accounts, assets, settings…
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(GlobalSearchBar);
