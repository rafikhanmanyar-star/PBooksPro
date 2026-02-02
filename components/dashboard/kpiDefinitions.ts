
import React from 'react';
import { AppState, LoanSubtype, TransactionType, RentalAgreementStatus, ContactType, InvoiceStatus, KpiDefinition, AccountType, InvoiceType } from '../../types';
import { ICONS } from '../../constants';

const calculateLoanSummary = (state: AppState) => {
    let totalLoanReceived = 0, totalLoanRepaid = 0;
    state.transactions.forEach(tx => {
        if (tx.type === TransactionType.LOAN) {
            if (tx.subtype === LoanSubtype.RECEIVE) totalLoanReceived += tx.amount;
            else if (tx.subtype === LoanSubtype.REPAY) totalLoanRepaid += tx.amount;
        }
    });
    return { outstandingLoan: totalLoanReceived - totalLoanRepaid };
};

// Helper to identify categories that should be excluded from Company P&L (Pass-through funds)
const getExcludedCategoryIds = (state: AppState) => {
    // 1. Equity adjustments
    const equityCats = state.categories
        .filter(c => c.name === 'Owner Equity' || c.name === 'Owner Withdrawn')
        .map(c => c.id);

    // 2. Liability Inflows (Not Income)
    const liabilityIncomeCats = state.categories
        .filter(c => c.name === 'Security Deposit' || c.name === 'Rental Income')
        .map(c => c.id);

    // 3. Liability Outflows (Not Expense)
    const liabilityExpenseCats = state.categories
        .filter(c => c.name === 'Security Deposit Refund' || c.name === 'Owner Payout' || c.name === 'Owner Security Payout')
        .map(c => c.id);

    return [...equityCats, ...liabilityIncomeCats, ...liabilityExpenseCats];
};

export const ALL_KPIS: KpiDefinition[] = [
    // General KPIs
    {
        id: 'totalBalance',
        title: 'Total Balance',
        group: 'General',
        icon: ICONS.wallet,
        // Calculated as total of all Bank/Cash accounts (Liquid Assets)
        // Exclude 'Internal Clearing' to prevent internal distribution logic from affecting visible cash balance
        getData: (state) => state.accounts
            .filter(acc => (acc.type === AccountType.BANK || acc.type === AccountType.CASH) && acc.name !== 'Internal Clearing')
            .reduce((sum, acc) => sum + acc.balance, 0),
    },
    {
        id: 'netIncome',
        title: 'Net Income (Company)',
        group: 'General',
        icon: ICONS.trendingUp,
        getData: (state) => {
            const excludedIds = new Set(getExcludedCategoryIds(state));

            const income = state.transactions
                .filter(t => t.type === TransactionType.INCOME && (!t.categoryId || !excludedIds.has(t.categoryId)))
                .reduce((acc, t) => acc + t.amount, 0);

            const expense = state.transactions
                .filter(t => t.type === TransactionType.EXPENSE && (!t.categoryId || !excludedIds.has(t.categoryId)))
                .reduce((acc, t) => acc + t.amount, 0);

            return income - expense;
        }
    },
    {
        id: 'totalIncome',
        title: 'Total Revenue (Company)',
        group: 'General',
        icon: ICONS.arrowDownCircle,
        getData: (state) => {
            const excludedIds = new Set(getExcludedCategoryIds(state));
            return state.transactions
                .filter(t => t.type === TransactionType.INCOME && (!t.categoryId || !excludedIds.has(t.categoryId)))
                .reduce((acc, t) => acc + t.amount, 0);
        }
    },
    {
        id: 'totalExpense',
        title: 'Total Expense (Company)',
        group: 'General',
        icon: ICONS.arrowUpCircle,
        getData: (state) => {
            const excludedIds = new Set(getExcludedCategoryIds(state));

            // Exclude transactions using Internal Clearing account (internal adjustments)
            const clearingAccount = state.accounts.find(a => a.name === 'Internal Clearing');

            return state.transactions
                .filter(t => {
                    // Must be EXPENSE type
                    if (t.type !== TransactionType.EXPENSE) return false;

                    // Exclude excluded categories (liability outflows, equity adjustments)
                    if (t.categoryId && excludedIds.has(t.categoryId)) return false;

                    // Exclude Internal Clearing account transactions (internal adjustments)
                    if (clearingAccount && t.accountId === clearingAccount.id) return false;

                    // Exclude EXPENSE transactions with INCOME categories (refunds and penalty reductions)
                    // These reduce income, not expenses (same logic as P&L)
                    if (t.categoryId) {
                        const category = state.categories.find(c => c.id === t.categoryId);
                        if (category && category.type === TransactionType.INCOME) {
                            // This is an expense that reduces income (like refund reduction or penalty reduction)
                            // Exclude from expenses - it's a revenue reduction, not an expense
                            return false;
                        }
                    }

                    return true;
                })
                .reduce((acc, t) => acc + t.amount, 0);
        }
    },
    {
        id: 'accountsReceivable',
        title: 'Accounts Receivable (A/R)',
        group: 'General',
        icon: ICONS.download,
        getData: (state) => {
            // Calculate A/R from invoices instead of relying solely on system account balance for accuracy
            // Exclude invoices from cancelled agreements (voided)
            return state.invoices
                .filter(inv => {
                    // Exclude paid invoices
                    if (inv.status === InvoiceStatus.PAID) return false;
                    // Exclude voided invoices (from cancelled agreements)
                    if (inv.description?.includes('VOIDED')) return false;
                    // Exclude invoices from cancelled agreements
                    if (inv.agreementId) {
                        const agreement = state.projectAgreements.find(pa => pa.id === inv.agreementId);
                        if (agreement && agreement.status === 'Cancelled') return false;
                    }
                    return true;
                })
                .reduce((sum, inv) => sum + (inv.amount - (inv.paidAmount || 0)), 0);
        },
    },
    {
        id: 'accountsPayable',
        title: 'Accounts Payable (A/P)',
        group: 'General',
        icon: ICONS.fileText,
        getData: (state) => {
            // Calculate A/P from bills
            // Use bill's paidAmount field directly (maintained by system)
            const billsDue = state.bills
                .filter(b => {
                    // Only include unpaid bills
                    const paidAmount = b.paidAmount || 0;
                    return paidAmount < b.amount - 0.01; // Allow small rounding differences
                })
                .reduce((sum, b) => {
                    const paidAmount = b.paidAmount || 0;
                    return sum + (b.amount - paidAmount);
                }, 0);

            return billsDue;
        },
    },
    {
        id: 'outstandingLoan',
        title: 'Outstanding Loan',
        group: 'General',
        icon: ICONS.loan,
        getData: (state) => calculateLoanSummary(state).outstandingLoan,
    },
    {
        id: 'monthlyTransferVolume',
        title: 'Transfer Vol. (30d)',
        group: 'General',
        icon: ICONS.repeat,
        getData: (state) => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return state.transactions
                .filter(tx => tx.type === TransactionType.TRANSFER && new Date(tx.date) >= thirtyDaysAgo)
                .reduce((sum, tx) => sum + tx.amount, 0);
        }
    },
    // Rental KPIs
    {
        id: 'bmFunds',
        title: 'BM Funds',
        group: 'Rental',
        icon: ICONS.building,
        getData: (state) => {
            // BM Funds = Collected Service Charges - Building Expenses (excluding owner payouts, security refunds, broker fees)
            const serviceIncomeCatIds = new Set(state.categories
                .filter(c => c.type === TransactionType.INCOME && c.name.toLowerCase().includes('service charge'))
                .map(c => c.id));

            const ownerExpenseCategoryNames = ['Owner Payout', 'Security Deposit Refund', 'Broker Fee', 'Owner Security Payout'];
            const getCategory = (id: string | undefined) => state.categories.find(c => c.id === id);

            const isOwnerExpense = (catId: string | undefined) => {
                const cat = getCategory(catId);
                if (!cat) return false;
                return ownerExpenseCategoryNames.some(n => n.toLowerCase() === cat.name.toLowerCase());
            };
            const isTenant = (contactId: string | undefined) => {
                if (!contactId) return false;
                const c = state.contacts.find(con => con.id === contactId);
                return c?.type === ContactType.TENANT;
            };

            let collected = 0;
            let expenses = 0;

            // 1. Transactions
            state.transactions.forEach(tx => {
                // Income
                let buildingId = tx.buildingId;
                if (!buildingId && tx.propertyId) {
                    const prop = state.properties.find(p => p.id === tx.propertyId);
                    if (prop) buildingId = prop.buildingId;
                }

                if (buildingId) {
                    if (tx.type === TransactionType.INCOME && tx.categoryId && serviceIncomeCatIds.has(tx.categoryId)) {
                        collected += tx.amount;
                    }
                    // Direct Expenses
                    if (tx.type === TransactionType.EXPENSE && !tx.billId) {
                        if (tx.propertyId) return; // Property/Owner cost
                        if (isTenant(tx.contactId)) return; // Tenant cost
                        if (!isOwnerExpense(tx.categoryId)) {
                            expenses += tx.amount;
                        }
                    }
                }
            });

            // 2. Bills (Accrued Expenses)
            state.bills.forEach(bill => {
                if (bill.buildingId) {
                    if (bill.propertyId) return;
                    if (isTenant(bill.contactId)) return;
                    if (!isOwnerExpense(bill.categoryId)) {
                        expenses += bill.amount;
                    }
                }
            });

            return collected - expenses;
        }
    },
    {
        id: 'occupiedUnits',
        title: 'Occupied Units',
        group: 'Rental',
        icon: ICONS.users,
        getData: (state) => state.rentalAgreements.filter(ra => ra.status === RentalAgreementStatus.ACTIVE).length,
    },
    {
        id: 'vacantUnits',
        title: 'Vacant Units',
        group: 'Rental',
        icon: ICONS.home,
        getData: (state) => {
            const occupiedIds = new Set(state.rentalAgreements.filter(ra => ra.status === RentalAgreementStatus.ACTIVE).map(ra => ra.propertyId));
            return state.properties.length - occupiedIds.size;
        },
    },
    {
        id: 'rentalArrears',
        title: 'Rental Arrears',
        group: 'Rental',
        icon: ICONS.alertTriangle,
        getData: (state) => state.invoices
            .filter(inv => (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE) && inv.status !== InvoiceStatus.PAID)
            .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0)
    },
    {
        id: 'rentalLiabilityHeld',
        title: 'Rental Liability',
        group: 'Rental',
        icon: ICONS.briefcase,
        getData: (state) => {
            // Identify Categories
            const findCatId = (name: string) => state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.id;

            const rentalIncId = findCatId('Rental Income');
            const ownerPayoutId = findCatId('Owner Payout');
            const brokerFeeId = findCatId('Broker Fee');

            let liability = 0;

            state.transactions.forEach(tx => {
                // 1. Increase Liability (Rental Income Collected)
                if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncId) {
                    liability += tx.amount;
                }
                // 2. Decrease Liability (Payouts & Expenses deducted from owner)
                else if (tx.type === TransactionType.EXPENSE) {
                    let isDeduction = false;

                    // Direct Payout
                    if (ownerPayoutId && tx.categoryId === ownerPayoutId) {
                        isDeduction = true;
                    }
                    // Property-linked owner expenses (Broker fees, repairs)
                    // Ensure it's NOT a tenant deduction (handled in Security Deposit KPI)
                    else if (tx.propertyId) {
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const contact = state.contacts.find(c => c.id === tx.contactId);

                        const isTenantRelated = contact?.type === ContactType.TENANT || (category && category.name.includes('(Tenant)'));

                        // Include standard owner expenses
                        if (!isTenantRelated && (
                            (brokerFeeId && tx.categoryId === brokerFeeId) ||
                            (category && category.name.includes('Property Repair (Owner)')) ||
                            // Other expenses if we assume property-linked = owner expense unless stated otherwise
                            true
                        )) {
                            isDeduction = true;
                        }
                    }

                    if (isDeduction) {
                        liability -= tx.amount;
                    }
                }
            });
            return liability;
        }
    },
    {
        id: 'securityDepositHeld',
        title: 'Security Liability',
        group: 'Rental',
        icon: ICONS.lock,
        getData: (state) => {
            // Identify Categories
            const findCatId = (name: string) => state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.id;

            const secDepId = findCatId('Security Deposit');
            const secRefId = findCatId('Security Deposit Refund');
            const ownerSecPayId = findCatId('Owner Security Payout');

            let liability = 0;

            state.transactions.forEach(tx => {
                // 1. Increase Liability (Money In from Tenant)
                if (tx.type === TransactionType.INCOME && tx.categoryId === secDepId) {
                    liability += tx.amount;
                }
                // 2. Decrease Liability (Money Out)
                else if (tx.type === TransactionType.EXPENSE) {
                    let isDeduction = false;

                    // Direct Category Match: Refund to Tenant OR Payout to Owner
                    if ((secRefId && tx.categoryId === secRefId) || (ownerSecPayId && tx.categoryId === ownerSecPayId)) {
                        isDeduction = true;
                    }
                    // Implicit Tenant Deductions (e.g. Repairs charged to tenant)
                    else {
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const contact = state.contacts.find(c => c.id === tx.contactId);

                        // If expense is linked to a Tenant OR category name implies tenant deduction
                        if (contact?.type === ContactType.TENANT || (category && category.name.includes('(Tenant)'))) {
                            isDeduction = true;
                        }
                    }

                    if (isDeduction) {
                        liability -= tx.amount;
                    }
                }
            });
            return liability;
        }
    },
    // Project KPIs
    {
        id: 'projectFunds',
        title: 'Project Funds',
        group: 'Project',
        icon: ICONS.briefcase,
        getData: (state) => {
            // Calculate net balance using the same formula as Funds Availability Report
            // netBalance = (income - expense) + (investment - equityOut) + loanNetBalance

            // Helper to check for Equity/Capital categories
            const equityCategoryNames = ['Owner Equity', 'Share Capital', 'Investment', 'Capital Injection'];
            const withdrawalCategoryNames = ['Owner Withdrawn', 'Drawings', 'Dividends', 'Profit Share', 'Owner Payout', 'Owner Security Payout', 'Security Deposit Refund'];

            const isEquityIncome = (catId?: string) => {
                if (!catId) return false;
                const c = state.categories.find(cat => cat.id === catId);
                return c && equityCategoryNames.includes(c.name);
            };

            const isEquityExpense = (catId?: string) => {
                if (!catId) return false;
                const c = state.categories.find(cat => cat.id === catId);
                return c && withdrawalCategoryNames.includes(c.name);
            };

            const equityAccountIds = new Set(state.accounts.filter(a => a.type === AccountType.EQUITY).map(a => a.id));

            let totalIncome = 0;
            let totalExpense = 0;
            let totalInvestment = 0;
            let totalEquityOut = 0;
            let totalLoanNetBalance = 0;

            state.projects.forEach(project => {
                let income = 0;
                let expense = 0;
                let investment = 0;
                let equityOut = 0;
                let loanNetBalance = 0;

                state.transactions.forEach(tx => {
                    // Resolve projectId from transaction, bill, or invoice
                    let txProjectId = tx.projectId;

                    if (!txProjectId && tx.billId) {
                        const bill = state.bills.find(b => b.id === tx.billId);
                        if (bill) txProjectId = bill.projectId;
                    }

                    if (!txProjectId && tx.invoiceId) {
                        const invoice = state.invoices.find(i => i.id === tx.invoiceId);
                        if (invoice) txProjectId = invoice.projectId;
                    }

                    if (txProjectId !== project.id) return;

                    if (tx.type === TransactionType.INCOME) {
                        if (isEquityIncome(tx.categoryId)) {
                            investment += tx.amount;
                        } else {
                            income += tx.amount;
                        }
                    } else if (tx.type === TransactionType.EXPENSE) {
                        if (isEquityExpense(tx.categoryId)) {
                            equityOut += tx.amount;
                        } else {
                            expense += tx.amount;
                        }
                    } else if (tx.type === TransactionType.TRANSFER) {
                        const isFromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
                        const isToEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);
                        const isMoveIn = tx.description?.toLowerCase().includes('equity move in');
                        const isMoveOut = tx.description?.toLowerCase().includes('equity move out');

                        const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
                        const isFromClearing = fromAccount?.name === 'Internal Clearing';
                        const isPMFeeTransfer = tx.description?.toLowerCase().includes('pm fee') ||
                            tx.description?.toLowerCase().includes('pm fee equity');

                        if (isFromEquity || isMoveIn) {
                            investment += tx.amount;
                        } else if (isToEquity || isMoveOut) {
                            if (isFromClearing && isPMFeeTransfer) {
                                investment += tx.amount;
                            } else {
                                equityOut += tx.amount;
                            }
                        }
                    } else if (tx.type === TransactionType.LOAN) {
                        if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                            loanNetBalance += tx.amount;
                        } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                            loanNetBalance -= tx.amount;
                        }
                    }
                });

                totalIncome += income;
                totalExpense += expense;
                totalInvestment += investment;
                totalEquityOut += equityOut;
                totalLoanNetBalance += loanNetBalance;
            });

            // Calculate total net balance: (income - expense) + (investment - equityOut) + loanNetBalance
            return (totalIncome - totalExpense) + (totalInvestment - totalEquityOut) + totalLoanNetBalance;
        }
    },
    {
        id: 'projectReceivable',
        title: 'Project Receivables',
        group: 'Project',
        icon: ICONS.download,
        getData: (state) => state.invoices
            .filter(inv => inv.invoiceType === InvoiceType.INSTALLMENT && inv.status !== InvoiceStatus.PAID)
            .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0)
    },
    // Building KPIs
    {
        id: 'buildingFunds',
        title: 'Building Funds',
        group: 'Rental',
        icon: ICONS.building,
        getData: (state) => {
            // Calculate net balance using the same formula as Funds Availability Report for buildings
            // netBalance = (income - expense) + loanNetBalance

            let totalIncome = 0;
            let totalExpense = 0;
            let totalLoanNetBalance = 0;

            state.buildings.forEach(building => {
                let income = 0;
                let expense = 0;
                let loanNetBalance = 0;

                state.transactions.forEach(tx => {
                    let txBuildingId = tx.buildingId;
                    if (!txBuildingId && tx.propertyId) {
                        const prop = state.properties.find(p => p.id === tx.propertyId);
                        if (prop) txBuildingId = prop.buildingId;
                    }

                    if (txBuildingId !== building.id) return;

                    if (tx.type === TransactionType.INCOME) {
                        income += tx.amount;
                    } else if (tx.type === TransactionType.EXPENSE) {
                        expense += tx.amount;
                    } else if (tx.type === TransactionType.LOAN) {
                        // Calculate loan net balance
                        // RECEIVE and COLLECT increase available funds (positive)
                        // GIVE and REPAY decrease available funds (negative)
                        if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                            loanNetBalance += tx.amount;
                        } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                            loanNetBalance -= tx.amount;
                        }
                    }
                });

                totalIncome += income;
                totalExpense += expense;
                totalLoanNetBalance += loanNetBalance;
            });

            // Calculate total net balance: (income - expense) + loanNetBalance
            return (totalIncome - totalExpense) + totalLoanNetBalance;
        }
    },
];
