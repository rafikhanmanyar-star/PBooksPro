import React, { memo, useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { TransactionType } from '../../types';
import {
    useTransactions,
    useProperties,
    useCategories,
    useContacts,
    useProjects,
    useStateSelector,
} from '../../hooks/useSelectiveState';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { getEffectiveCommissionBrokerContactId } from '../../utils/brokerCommissionAttribution';

interface BrokerLedgerProps {
    brokerId: string | null;
    context?: 'Rental' | 'Project';
    buildingId?: string;
    propertyId?: string;
}

type SortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

type BrokerLedgerLine = {
    id: string;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    type: string;
    balance: number;
};

const LEDGER_ROW_HEIGHT = 52;
const LEDGER_LIST_MAX_H = 520;
const OVERSCAN_COUNT = 6;
const MIN_TABLE_WIDTH = 640;

type BrokerLedgerRowExtra = {
    rows: BrokerLedgerLine[];
};

const BrokerLedgerRow = memo(function BrokerLedgerRow(props: RowComponentProps<BrokerLedgerRowExtra>) {
    const { index, style, ariaAttributes, rows } = props;
    const item = rows[index];
    if (!item) {
        return <div style={style} aria-hidden />;
    }

    return (
        <div
            {...ariaAttributes}
            style={{ ...style, minWidth: MIN_TABLE_WIDTH }}
            className="flex items-stretch border-b border-app-border hover:bg-app-table-hover transition-colors duration-ds text-sm"
        >
            <div className="w-[108px] shrink-0 py-4 pl-4 pr-3 text-app-muted whitespace-nowrap sm:pl-0">
                {formatDate(item.date)}
            </div>
            <div className="min-w-0 flex-1 px-3 py-4 text-app-text truncate" title={item.particulars}>
                {item.particulars}
            </div>
            <div className="w-[100px] shrink-0 px-3 py-4 text-right text-ds-success tabular-nums whitespace-nowrap">
                {item.credit > 0 ? (item.credit || 0).toLocaleString() : '-'}
            </div>
            <div className="w-[100px] shrink-0 px-3 py-4 text-right text-ds-danger tabular-nums whitespace-nowrap">
                {item.debit > 0 ? (item.debit || 0).toLocaleString() : '-'}
            </div>
            <div
                className={`w-[112px] shrink-0 py-4 pl-3 pr-4 text-right font-medium tabular-nums whitespace-nowrap sm:pr-0 ${
                    item.balance > 0 ? 'text-ds-danger' : 'text-app-text'
                }`}
            >
                {(item.balance || 0).toLocaleString()}
            </div>
        </div>
    );
});

BrokerLedgerRow.displayName = 'BrokerLedgerRow';

const BrokerLedger: React.FC<BrokerLedgerProps> = ({ brokerId, context, buildingId, propertyId }) => {
    const transactions = useTransactions();
    const properties = useProperties();
    const categories = useCategories();
    const contacts = useContacts();
    const projects = useProjects();
    const rentalAgreements = useStateSelector((s) => s.rentalAgreements);
    const projectAgreements = useStateSelector((s) => s.projectAgreements);
    const whatsAppTemplates = useStateSelector((s) => s.whatsAppTemplates);
    const whatsAppMode = useStateSelector((s) => s.whatsAppMode);
    const { openChat } = useWhatsApp();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Property scope for Rental context: when building/property filter is applied, ledger shows only that scope.
    const rentalPropertyIdsInScope = useMemo(() => {
        if (context !== 'Rental' || (!buildingId && !propertyId)) return null;
        if (propertyId) return new Set<string>([String(propertyId)]);
        return new Set(
            properties
                .filter(p => p.buildingId === buildingId)
                .map(p => String(p.id))
        );
    }, [context, buildingId, propertyId, properties]);

    const ledgerItems = useMemo((): BrokerLedgerLine[] => {
        if (!brokerId) return [];
        
        const brokerFeeCategory = categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = categories.find(c => c.name === 'Rebate Amount');
        const relevantCategoryIds = [brokerFeeCategory?.id, rebateCategory?.id].filter(Boolean) as string[];
        const attributionOpts = {
            brokerFeeCategoryId: brokerFeeCategory?.id,
            rebateCategoryId: rebateCategory?.id,
            projectAgreements,
            rentalAgreements,
        };

        const items: Omit<BrokerLedgerLine, 'balance'>[] = [];

        // 1. Broker Fees from Rental Agreements (Credit). Exclude renewed agreements so broker is not charged again on renewal.
        // When filter is applied, only include agreements for in-scope properties.
        if (!context || context === 'Rental') {
            rentalAgreements
                .filter(ra => {
                    if (ra.previousAgreementId || ra.brokerId !== brokerId || !(ra.brokerFee || 0)) return false;
                    if (rentalPropertyIdsInScope && (!ra.propertyId || !rentalPropertyIdsInScope.has(String(ra.propertyId)))) return false;
                    return true;
                })
                .forEach(ra => {
                    const property = properties.find(p => p.id === ra.propertyId);
                    items.push({
                        id: `fee-rent-${ra.id}`,
                        date: ra.startDate,
                        particulars: `Commission for ${property?.name || 'Unit'} (Agr #${ra.agreementNumber})`,
                        debit: 0,
                        credit: ra.brokerFee || 0,
                        type: 'Fee'
                    });
                });
        }

        // 2. Broker Fees from Project Agreements (Credit)
        // Include only if context is Project or undefined (All)
        if (!context || context === 'Project') {
            projectAgreements
                .filter(pa => pa.rebateBrokerId === brokerId && (pa.rebateAmount || 0) > 0)
                .forEach(pa => {
                    const project = projects.find(p => p.id === pa.projectId);
                    items.push({
                        id: `fee-proj-${pa.id}`,
                        date: pa.issueDate,
                        particulars: `Commission for ${project?.name || 'Project'} (Agr #${pa.agreementNumber})`,
                        debit: 0,
                        credit: pa.rebateAmount || 0,
                        type: 'Fee'
                    });
                });
        }
            
        // 3. Payments to Broker (Debit). When Rental filter is applied, only include payments for in-scope properties (tx.propertyId).
        transactions
            .filter(tx => {
                if (tx.type !== TransactionType.EXPENSE || !tx.categoryId || !relevantCategoryIds.includes(tx.categoryId)) return false;
                const effectiveId = getEffectiveCommissionBrokerContactId(tx, attributionOpts);
                if (effectiveId !== brokerId) return false;
                const category = categories.find(c => c.id === tx.categoryId);
                const isRebate = category?.name === 'Rebate Amount';

                if (context === 'Project') {
                    return !!tx.projectId || isRebate;
                } else if (context === 'Rental') {
                    if (tx.projectId || isRebate) return false;
                    if (rentalPropertyIdsInScope) {
                        if (!tx.propertyId) return false;
                        return rentalPropertyIdsInScope.has(String(tx.propertyId));
                    }
                    return true;
                }
                return true;
            })
            .forEach(tx => {
                let desc = tx.description || 'Commission Payment';
                if (tx.projectId) {
                    const p = projects.find(p => p.id === tx.projectId);
                    desc += ` (${p?.name})`;
                }
                items.push({
                    id: `pay-${tx.id}`,
                    date: tx.date,
                    particulars: desc,
                    debit: tx.amount,
                    credit: 0,
                    type: 'Payment'
                });
            });

        // Sort
        items.sort((a, b) => {
            let valA: string | number = a[sortConfig.key];
            let valB: string | number = b[sortConfig.key];
            
            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = String(valB).toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        let runningBalance = 0;
        return items.map(item => {
            runningBalance += item.credit - item.debit;
            return { ...item, balance: runningBalance };
        });

    }, [brokerId, context, rentalPropertyIdsInScope, transactions, rentalAgreements, projectAgreements, properties, projects, categories, sortConfig]);

    const rowProps = useMemo(
        () => ({ rows: ledgerItems }) satisfies BrokerLedgerRowExtra,
        [ledgerItems]
    );

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className={`ml-1 text-[10px] ${sortConfig.key === column ? 'text-primary' : 'text-app-muted'}`}>
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    if (!brokerId) return null;

    if (ledgerItems.length === 0) {
        return <p className="text-slate-500 text-center py-8">No commissions or payments recorded for this broker in this section.</p>;
    }

    const listHeight = Math.min(LEDGER_LIST_MAX_H, Math.max(ledgerItems.length * LEDGER_ROW_HEIGHT, LEDGER_ROW_HEIGHT));

    const handleSendWhatsApp = () => {
        if (!brokerId) return;
        const brokerContact = contacts.find(c => c.id === brokerId);
        if (!brokerContact) return;

        const totalEarned = ledgerItems.reduce((sum, item) => sum + item.credit, 0);
        const totalPaid = ledgerItems.reduce((sum, item) => sum + item.debit, 0);
        const finalBalance = totalEarned - totalPaid;

        const template = whatsAppTemplates.brokerPayoutLedger || 'Dear {contactName}, your commission balance is {balance}.';
        const message = WhatsAppService.generateBrokerPayoutLedger(
            template, brokerContact, totalEarned, totalPaid, finalBalance
        );
        sendOrOpenWhatsApp(
            { contact: brokerContact, message, phoneNumber: brokerContact.contactNo || undefined },
            () => whatsAppMode,
            openChat
        );
    };

    return (
        <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8" style={{ minWidth: MIN_TABLE_WIDTH }}>
                    <div className="border-b border-app-border bg-app-table-header">
                        <div className="flex text-sm font-semibold text-app-muted" style={{ minWidth: MIN_TABLE_WIDTH }}>
                            <button
                                type="button"
                                onClick={() => handleSort('date')}
                                className="w-[108px] shrink-0 py-3.5 pl-4 pr-3 text-left sm:pl-0 cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none"
                            >
                                Date <SortIcon column="date" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSort('particulars')}
                                className="min-w-0 flex-1 px-3 py-3.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none"
                            >
                                Particulars <SortIcon column="particulars" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSort('credit')}
                                className="w-[100px] shrink-0 px-3 py-3.5 text-right cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none"
                            >
                                Fee Earned (+) <SortIcon column="credit" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSort('debit')}
                                className="w-[100px] shrink-0 px-3 py-3.5 text-right cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none"
                            >
                                Paid (-) <SortIcon column="debit" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSort('balance')}
                                className="w-[112px] shrink-0 py-3.5 pl-3 pr-4 text-right sm:pr-0 cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none"
                            >
                                Balance <SortIcon column="balance" />
                            </button>
                        </div>
                    </div>
                    <List<BrokerLedgerRowExtra>
                        rowHeight={LEDGER_ROW_HEIGHT}
                        rowCount={ledgerItems.length}
                        overscanCount={OVERSCAN_COUNT}
                        rowComponent={BrokerLedgerRow}
                        rowProps={rowProps}
                        style={{ height: listHeight, width: '100%', minWidth: MIN_TABLE_WIDTH }}
                    />
                </div>
            </div>
            {/* WhatsApp Send Ledger Button */}
            <div className="flex justify-end mt-3 pt-3 border-t border-app-border">
                <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success hover:bg-app-toolbar transition-colors duration-ds"
                >
                    <div className="w-3.5 h-3.5">{ICONS.whatsapp}</div>
                    Send Ledger via WhatsApp
                </button>
            </div>
        </div>
    );
};

export default BrokerLedger;
