import React, { useMemo } from 'react';
import { Transaction, TransactionType } from '../../types';
import { CURRENCY } from '../../constants';

interface LedgerSummaryProps {
    transactions: Array<Transaction & { balance?: number }>;
}

const LedgerSummary: React.FC<LedgerSummaryProps> = ({ transactions }) => {
    const summary = useMemo(() => {
        let totalIncome = 0;
        let totalExpense = 0;
        let totalTransfer = 0;
        let totalLoan = 0;
        let count = 0;

        transactions.forEach(tx => {
            count++;
            switch (tx.type) {
                case TransactionType.INCOME:
                    totalIncome += tx.amount;
                    break;
                case TransactionType.EXPENSE:
                    totalExpense += tx.amount;
                    break;
                case TransactionType.TRANSFER:
                    totalTransfer += tx.amount;
                    break;
                case TransactionType.LOAN:
                    totalLoan += tx.amount;
                    break;
            }
        });

        const netBalance = totalIncome - totalExpense;
        const lastBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance || 0 : 0;

        return {
            totalIncome,
            totalExpense,
            totalTransfer,
            totalLoan,
            netBalance,
            lastBalance,
            count
        };
    }, [transactions]);

    const SummaryCard: React.FC<{
        title: string;
        amount: number;
        icon: React.ReactNode;
        type?: 'income' | 'expense' | 'neutral' | 'info';
        prefix?: string;
    }> = ({ title, amount, icon, type = 'neutral', prefix = '' }) => {
        const styles = {
            income: 'border-emerald-500 text-emerald-700 bg-emerald-50/30',
            expense: 'border-rose-500 text-rose-700 bg-rose-50/30',
            neutral: 'border-slate-300 text-slate-700 bg-slate-50/30',
            info: 'border-indigo-500 text-indigo-700 bg-indigo-50/30',
        };

        return (
            <div className={`border-l-4 rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-200 bg-white border-y border-r border-slate-200 ${styles[type]}`}>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate">{title}</p>
                        <p className={`text-base sm:text-lg font-bold font-mono tabular-nums tracking-tight truncate flex items-baseline gap-1`}>
                            <span className="text-xs opacity-70 font-sans">{prefix || CURRENCY}</span>
                            <span>{amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </p>
                    </div>
                    <div className="opacity-40 flex-shrink-0">
                        <div className="w-6 h-6">{icon}</div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {/* Total Income */}
            <SummaryCard
                title="Total Income"
                amount={summary.totalIncome}
                type="income"
                prefix="+"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                    </svg>
                }
            />

            {/* Total Expense */}
            <SummaryCard
                title="Total Expense"
                amount={summary.totalExpense}
                type="expense"
                prefix="-"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                    </svg>
                }
            />

            {/* Net Flow */}
            <SummaryCard
                title="Net Cash Flow"
                amount={Math.abs(summary.netBalance)}
                type={summary.netBalance >= 0 ? 'income' : 'expense'}
                prefix={summary.netBalance >= 0 ? '+' : '-'}
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                }
            />

            {/* Running Balance */}
            <SummaryCard
                title="Current Balance"
                amount={summary.lastBalance}
                type="neutral"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                }
            />

            {/* Transfers */}
            <SummaryCard
                title="Internal Transfers"
                amount={summary.totalTransfer}
                type="info"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                }
            />

            {/* Transaction Count */}
            <div className="border-l-4 border-indigo-500 rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-200 bg-white border-y border-r border-slate-200 bg-indigo-50/30 text-indigo-700">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate">Total Volume</p>
                        <p className="text-base sm:text-lg font-bold truncate tracking-tight">{summary.count.toLocaleString()}</p>
                    </div>
                    <div className="opacity-40 flex-shrink-0">
                        <div className="w-6 h-6">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LedgerSummary;

