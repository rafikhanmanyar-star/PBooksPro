
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
    // Calculated as total of all Bank/Cash/CreditCard accounts (Liquid Assets) - STRICTLY BANK ONLY
    // Exclude 'Internal Clearing' to prevent internal distribution logic from affecting visible cash balance
    getData: (state) => state.accounts
        .filter(acc => acc.type === AccountType.BANK && acc.name !== 'Internal Clearing')
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
          return state.transactions
            .filter(t => t.type === TransactionType.EXPENSE && (!t.categoryId || !excludedIds.has(t.categoryId)))
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
        return state.invoices
            .filter(inv => inv.status !== InvoiceStatus.PAID)
            .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);
    },
  },
  {
    id: 'accountsPayable',
    title: 'Accounts Payable (A/P)',
    group: 'General',
    icon: ICONS.fileText,
    getData: (state) => {
        // Calculate A/P from bills
        const billsDue = state.bills
            .filter(b => b.status !== InvoiceStatus.PAID)
            .reduce((sum, b) => sum + (b.amount - b.paidAmount), 0);
            
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
      title: 'Projects Funds',
      group: 'Project',
      icon: ICONS.briefcase,
      getData: (state) => {
          let income = 0;
          let expense = 0;
          const excludedIds = new Set(getExcludedCategoryIds(state));

          state.transactions.forEach(tx => {
              if (tx.projectId) {
                  if (tx.type === TransactionType.INCOME && (!tx.categoryId || !excludedIds.has(tx.categoryId))) {
                      income += tx.amount;
                  }
                  if (tx.type === TransactionType.EXPENSE && (!tx.categoryId || !excludedIds.has(tx.categoryId))) {
                      expense += tx.amount;
                  }
              }
          });
          return income - expense;
      }
  },
  {
      id: 'totalProjectNet',
      title: 'Total Project Net',
      group: 'Project',
      icon: ICONS.dollarSign,
      getData: (state) => {
          let income = 0;
          let expense = 0;
          
          const excludedIds = new Set(getExcludedCategoryIds(state));

          state.transactions.forEach(tx => {
              if (tx.projectId) {
                  if (tx.type === TransactionType.INCOME && (!tx.categoryId || !excludedIds.has(tx.categoryId))) {
                      income += tx.amount;
                  }
                  if (tx.type === TransactionType.EXPENSE && (!tx.categoryId || !excludedIds.has(tx.categoryId))) {
                      expense += tx.amount;
                  }
              }
          });
          return income - expense;
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
];
