
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
    ChartAccount,
    JournalEntry,
    LedgerTransaction,
    AccountType
} from '../types/accounting';
import { accountingApi } from '../services/api/accountingApi';

interface AccountingContextType {
    accounts: ChartAccount[];
    entries: JournalEntry[];
    postJournalEntry: (entry: Omit<JournalEntry, 'id' | 'status'>) => void;
    createAccount: (account: Partial<ChartAccount>) => Promise<void>;
    getAccountLedger: (accountId: string) => LedgerTransaction[];

    // Financial Snapshots
    totalRevenue: number;
    grossProfit: number;
    netMargin: number;
    receivablesTotal: number;
    payablesTotal: number;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [accounts, setAccounts] = useState<ChartAccount[]>([]);
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [ledgers, setLedgers] = useState<Record<string, LedgerTransaction[]>>({});

    React.useEffect(() => {
        accountingApi.getAccounts().then(setAccounts).catch(console.error);
    }, []);

    const postJournalEntry = useCallback(async (entry: Omit<JournalEntry, 'id' | 'status'>) => {
        try {
            await accountingApi.postJournalEntry(entry);
            // Refresh accounts to show updated balances
            const updatedAccounts = await accountingApi.getAccounts();
            setAccounts(updatedAccounts);
            // Optionally fetch entries if needed
        } catch (error) {
            console.error('Failed to post journal entry:', error);
            throw error;
        }
    }, []);

    const createAccount = useCallback(async (account: Partial<ChartAccount>) => {
        try {
            await accountingApi.createAccount(account);
            const updatedAccounts = await accountingApi.getAccounts();
            setAccounts(updatedAccounts);
        } catch (error) {
            console.error('Failed to create account:', error);
            throw error;
        }
    }, []);

    const getAccountLedger = useCallback((accountId: string) => {
        // Return cached ledger or empty array, trigger fetch
        if (!ledgers[accountId]) {
            accountingApi.getLedger(accountId).then(txns => {
                setLedgers(prev => ({ ...prev, [accountId]: txns }));
            });
            return [];
        }
        return ledgers[accountId];
    }, [ledgers]);

    // Financial calculations
    const revenue = useMemo(() => accounts.find(a => a.name === 'Sales Revenue')?.balance || 0, [accounts]);
    const cogsValue = useMemo(() => accounts.find(a => a.name === 'Cost of Goods Sold')?.balance || 0, [accounts]);
    const grossProfit = revenue - cogsValue;
    const receivablesTotal = useMemo(() => accounts.find(a => a.name === 'Accounts Receivable')?.balance || 0, [accounts]);
    const payablesTotal = useMemo(() => accounts.find(a => a.name === 'Accounts Payable')?.balance || 0, [accounts]);

    const value = {
        accounts,
        entries,
        postJournalEntry,
        createAccount,
        getAccountLedger,
        totalRevenue: revenue,
        grossProfit,
        netMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        receivablesTotal,
        payablesTotal
    };

    return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>;
};

export const useAccounting = () => {
    const context = useContext(AccountingContext);
    if (!context) throw new Error('useAccounting must be used within an AccountingProvider');
    return context;
}
