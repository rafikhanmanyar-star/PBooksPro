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

    const formatAmount = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    const SummaryCard: React.FC<{
        title: string;
        amount: number;
        valueColor?: 'green' | 'white' | 'rose' | 'slate';
        prefix?: string;
        isCount?: boolean;
    }> = ({ title, amount, valueColor = 'white', prefix = '', isCount = false }) => {
        const valueStyles = {
            green: 'text-emerald-400 font-bold',
            white: 'text-white font-semibold',
            rose: 'text-rose-400 font-semibold',
            slate: 'text-slate-300 font-semibold',
        };
        return (
            <div className="rounded-xl px-4 py-3 bg-slate-700/40 border border-slate-600/50 shadow-sm backdrop-blur-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{title}</p>
                <p className={`text-sm sm:text-base font-bold tabular-nums tracking-tight ${valueStyles[valueColor]}`}>
                    {isCount ? amount.toLocaleString() : `${prefix}${CURRENCY} ${formatAmount(amount)}`}
                </p>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* Net Flow - prominent green per reference */}
            <SummaryCard
                title="Net Flow"
                amount={Math.abs(summary.netBalance)}
                valueColor={summary.netBalance >= 0 ? 'green' : 'rose'}
                prefix={summary.netBalance >= 0 ? '+' : '-'}
            />

            {/* Total Income - white text per reference */}
            <SummaryCard
                title="Total Income"
                amount={summary.totalIncome}
                valueColor="white"
                prefix="+"
            />

            {/* Total Expenses - white text per reference */}
            <SummaryCard
                title="Total Expenses"
                amount={summary.totalExpense}
                valueColor="white"
                prefix="-"
            />

            {/* Current Balance */}
            <SummaryCard
                title="Current Balance"
                amount={summary.lastBalance}
                valueColor="slate"
            />

            {/* Internal Transfers */}
            <SummaryCard
                title="Internal Transfers"
                amount={summary.totalTransfer}
                valueColor="slate"
            />

            {/* Transaction Count */}
            <SummaryCard
                title="Total Volume"
                amount={summary.count}
                valueColor="slate"
                isCount
            />
        </div>
    );
};

export default LedgerSummary;

