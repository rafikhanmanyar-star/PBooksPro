/**
 * Finance domain — accounts, transactions, invoices, bills, categories.
 * Prefer these hooks over useAppContext() in finance screens to avoid full-tree re-renders.
 */
import { useMemo } from 'react';
import {
  useAccounts,
  useTransactions,
  useInvoices,
  useBills,
  useCategories,
  useContacts,
  useVendors,
  useDispatchOnly,
} from '../../hooks/useSelectiveState';

export function useFinanceDomain() {
  const accounts = useAccounts();
  const transactions = useTransactions();
  const invoices = useInvoices();
  const bills = useBills();
  const categories = useCategories();
  const contacts = useContacts();
  const vendors = useVendors();
  const dispatch = useDispatchOnly();

  return useMemo(
    () => ({
      accounts,
      transactions,
      invoices,
      bills,
      categories,
      contacts,
      vendors,
      dispatch,
    }),
    [accounts, transactions, invoices, bills, categories, contacts, vendors, dispatch]
  );
}
