
import React, { useState, useMemo } from 'react';
import {
    useCategories,
    useContacts,
    useProjects,
    useProperties,
    useStateSelector,
    useTransactions,
} from '../../hooks/useSelectiveState';
import { ContactType, TransactionType } from '../../types';
import { getEffectiveCommissionBrokerContactId } from '../../utils/brokerCommissionAttribution';
import { CURRENCY, ICONS } from '../../constants';
import BrokerPayoutModal from './BrokerPayoutModal';
import BrokerLedger from './BrokerLedger';
import BrokerProjectFeeDimensionReport from './BrokerProjectFeeDimensionReport';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useBrokerBalancesAggregation } from '../../hooks/queries/useAggregationQueries';

interface BrokerBalance {
    brokerId: string;
    brokerName: string;
    earned: number;
    paid: number;
    balance: number;
}

interface BrokerPayoutsProps {
    context?: 'Rental' | 'Project';
}

const BrokerPayouts: React.FC<BrokerPayoutsProps> = ({ context }) => {
    const { isAuthenticated } = useAuth();
    const categories = useCategories();
    const contacts = useContacts();
    const transactions = useTransactions();
    const properties = useProperties();
    const projects = useProjects();
    const rentalAgreements = useStateSelector((s) => s.rentalAgreements);
    const projectAgreements = useStateSelector((s) => s.projectAgreements);
    const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const aggregationContext = context ?? 'all';
    const { data: brokerAggregation, isSuccess: brokerAggregationSuccess } = useBrokerBalancesAggregation(
        isAuthenticated,
        aggregationContext
    );

    const brokerBalances = useMemo<BrokerBalance[]>(() => {
        if (isAuthenticated && brokerAggregationSuccess && brokerAggregation?.rows) {
            return brokerAggregation.rows
                .map((r) => {
                    const broker = contacts.find((c) => c.id === r.brokerId);
                    return {
                        brokerId: r.brokerId,
                        brokerName: broker?.name || 'Unknown Broker',
                        earned: r.commissionsEarned,
                        paid: r.commissionsPaid,
                        balance: r.outstandingCommission,
                    };
                })
                .sort((a, b) => b.balance - a.balance);
        }

        const brokerFeeCategory = categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = categories.find(c => c.name === 'Rebate Amount');
        const brokerFeeCategoryId = brokerFeeCategory?.id;
        const rebateCategoryId = rebateCategory?.id;

        // We look for payments in either "Broker Fee" or "Rebate Amount" categories
        const relevantCategoryIds = [brokerFeeCategoryId, rebateCategoryId].filter(Boolean) as string[];
        const attributionOpts = {
            brokerFeeCategoryId,
            rebateCategoryId,
            projectAgreements: projectAgreements,
            rentalAgreements: rentalAgreements,
        };

        const brokerData: { [id: string]: { earned: number; paid: number } } = {};

        // Initialize with both Brokers and Dealers
        contacts
            .filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER)
            .forEach(broker => {
                brokerData[broker.id] = { earned: 0, paid: 0 };
            });

        // 1. Calculate Earned Fees (from Rental Agreements). Exclude renewed agreements so broker is not charged again on renewal.
        if (!context || context === 'Rental') {
            rentalAgreements.forEach(ra => {
                if (ra.previousAgreementId) return;
                if (ra.brokerId && (ra.brokerFee || 0) > 0) {
                    if (!brokerData[ra.brokerId]) brokerData[ra.brokerId] = { earned: 0, paid: 0 };
                    brokerData[ra.brokerId].earned += (ra.brokerFee || 0);
                }
            });
        }

        // 2. Calculate Earned Fees (from Project Agreements - Rebates)
        if (!context || context === 'Project') {
            projectAgreements.forEach(pa => {
                if (pa.rebateBrokerId && (pa.rebateAmount || 0) > 0) {
                    if (!brokerData[pa.rebateBrokerId]) brokerData[pa.rebateBrokerId] = { earned: 0, paid: 0 };
                    brokerData[pa.rebateBrokerId].earned += (pa.rebateAmount || 0);
                }
            });
        }

        // 3. Calculate Paid Fees (from Expenses). Attribution uses current agreement broker when agreementId is set.
        const brokerPayments = transactions.filter(
            (tx) => tx.type === TransactionType.EXPENSE && tx.categoryId && relevantCategoryIds.includes(tx.categoryId)
        );
        
        brokerPayments.forEach(tx => {
            const category = categories.find(c => c.id === tx.categoryId);
            const isRebate = category?.name === 'Rebate Amount';
            let shouldInclude = true;

            if (context === 'Project') {
                // Must be linked to a project OR be a Rebate category
                if (!tx.projectId && !isRebate) shouldInclude = false;
            } else if (context === 'Rental') {
                // Must NOT be linked to a project AND not be a Rebate category
                if (tx.projectId || isRebate) shouldInclude = false;
            }

            if (!shouldInclude) return;

            const effectiveBrokerId = getEffectiveCommissionBrokerContactId(tx, attributionOpts);
            if (!effectiveBrokerId) return;
            if (!brokerData[effectiveBrokerId]) brokerData[effectiveBrokerId] = { earned: 0, paid: 0 };
            brokerData[effectiveBrokerId].paid += tx.amount;
        });

        return Object.entries(brokerData).map(([brokerId, data]) => {
            const broker = contacts.find(c => c.id === brokerId);
            return {
                brokerId,
                brokerName: broker?.name || 'Unknown Broker',
                ...data,
                balance: data.earned - data.paid,
            };
        }).filter(item => Math.abs(item.balance) > 0.01 || item.earned > 0 || item.paid > 0).sort((a,b) => b.balance - a.balance);

    }, [isAuthenticated, brokerAggregationSuccess, brokerAggregation?.rows, rentalAgreements, projectAgreements, transactions, contacts, categories, context]);

    const filteredBrokerBalances = useMemo(() => {
        if (!searchQuery) return brokerBalances;
        const lower = searchQuery.toLowerCase();
        return brokerBalances.filter(b => {
            // Match Broker Name
            if (b.brokerName.toLowerCase().includes(lower)) return true;
            
            // Match Related Rental Properties
            if (!context || context === 'Rental') {
                const hasRentalMatch = rentalAgreements.some(ra => {
                    if (ra.brokerId !== b.brokerId) return false;
                    const property = properties.find(p => p.id === ra.propertyId);
                    return property?.name.toLowerCase().includes(lower);
                });
                if (hasRentalMatch) return true;
            }

            // Match Related Projects
            if (!context || context === 'Project') {
                const hasProjectMatch = projectAgreements.some(pa => {
                    if (pa.rebateBrokerId !== b.brokerId) return false;
                    const project = projects.find(p => p.id === pa.projectId);
                    return project?.name.toLowerCase().includes(lower);
                });
                if (hasProjectMatch) return true;
            }

            return false;
        });
    }, [brokerBalances, searchQuery, rentalAgreements, projectAgreements, properties, projects, context]);

    const selectedBrokerData = useMemo(() => {
        return brokerBalances.find(b => b.brokerId === selectedBrokerId);
    }, [selectedBrokerId, brokerBalances]);
    
    const selectedBrokerContact = contacts.find(c => c.id === selectedBrokerId);

    return (
        <div className="flex flex-col gap-6 bg-background min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
            <Card className="md:col-span-1 h-fit flex flex-col max-h-[calc(100vh-12rem)] p-4">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2 text-app-text">Broker Balances {context ? `(${context})` : ''}</h3>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <Input 
                            placeholder="Search broker/project/unit..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 py-1.5 text-sm"
                        />
                        {searchQuery && (
                            <button 
                                type="button"
                                onClick={() => setSearchQuery('')} 
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text transition-colors duration-ds"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>
                </div>
                
                {filteredBrokerBalances.length > 0 ? (
                    <div className="divide-y divide-app-border overflow-y-auto -mx-1 px-1">
                        {filteredBrokerBalances.map(broker => (
                            <button 
                                type="button"
                                key={broker.brokerId} 
                                onClick={() => setSelectedBrokerId(broker.brokerId)} 
                                className={`w-full text-left p-2 rounded-md flex justify-between items-center gap-2 transition-colors duration-ds ${selectedBrokerId === broker.brokerId ? 'bg-nav-active border border-primary/25' : 'hover:bg-app-toolbar/80 border border-transparent'}`}
                            >
                                <span className={`font-semibold truncate ${selectedBrokerId === broker.brokerId ? 'text-primary' : 'text-app-text'}`}>
                                    {broker.brokerName}
                                </span>
                                <span className="text-sm text-app-muted whitespace-nowrap tabular-nums">
                                    {CURRENCY} {broker.balance.toLocaleString()}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-app-muted text-center py-4">
                        {searchQuery ? 'No brokers found matching search.' : 'No broker fees recorded.'}
                    </p>
                )}
            </Card>

            <div className="md:col-span-3 space-y-4 min-w-0">
                {selectedBrokerData && selectedBrokerContact ? (
                    <>
                        <Card className="p-4 md:p-5">
                            <div className="flex justify-between items-center gap-3 flex-wrap">
                                <h3 className="text-xl font-bold text-app-text">{selectedBrokerContact.name}</h3>
                                {selectedBrokerData.balance > 0 && <Button onClick={() => setIsModalOpen(true)} className="!bg-primary hover:!bg-ds-primary-hover !text-ds-on-primary">Pay Commission</Button>}
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-sm text-app-muted">Total Earned</p>
                                    <p className="font-semibold text-lg text-ds-success">{CURRENCY} {selectedBrokerData.earned.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-app-muted">Total Paid</p>
                                    <p className="font-semibold text-lg text-app-text">{CURRENCY} {selectedBrokerData.paid.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-app-muted">Balance Due</p>
                                    <p className="font-bold text-xl text-ds-danger">{CURRENCY} {selectedBrokerData.balance.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-4 md:p-5">
                            <h3 className="text-lg font-semibold mb-3 text-app-text">Fee Ledger {context ? `(${context})` : ''}</h3>
                            <BrokerLedger brokerId={selectedBrokerId} context={context} />
                        </Card>
                    </>
                ) : (
                    <Card className="p-8">
                        <div className="text-center py-12">
                            <p className="text-app-muted">Select a broker to view details and payment history.</p>
                        </div>
                    </Card>
                )}
            </div>
            </div>

            {selectedBrokerData && selectedBrokerContact && (
                <BrokerPayoutModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    broker={selectedBrokerContact}
                    balanceDue={selectedBrokerData.balance}
                    context={context}
                />
            )}

            {context === 'Project' && <BrokerProjectFeeDimensionReport />}
        </div>
    );
};

export default BrokerPayouts;
