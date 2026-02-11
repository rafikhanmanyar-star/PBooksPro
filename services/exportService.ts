
import React from 'react';
import { AppState, AppAction, ImportLogEntry, TransactionType, LoanSubtype, InvoiceType, AccountType } from '../types';
import * as XLSX from 'xlsx';
import { useProgress } from '../context/ProgressContext';

type ProgressReporter = ReturnType<typeof useProgress>;

// --- EXPORT FUNCTIONALITY ---

export async function exportToExcel(state: AppState, filename: string, progress: ProgressReporter, dispatch: React.Dispatch<AppAction>) {
    progress.startProgress('Exporting Complete Data');
    
    try {
        progress.updateProgress(5, 'Preparing export workbook...');

        // Use the in-memory state passed from the UI (most up to date).
        const s: AppState = state;

        const safeJson = (val: any) => JSON.stringify(val ?? null);

        // --- Lookups (ID -> Friendly) ---
        const accountsById = new Map(s.accounts.map(a => [a.id, a.name]));
        const contactsById = new Map(s.contacts.map(c => [c.id, c.name]));
        const vendorsById = new Map((s.vendors || []).map(v => [v.id, v.name]));
        const categoriesById = new Map(s.categories.map(c => [c.id, c.name]));
        const projectsById = new Map(s.projects.map(p => [p.id, p.name]));
        const buildingsById = new Map(s.buildings.map(b => [b.id, b.name]));
        const propertiesById = new Map(s.properties.map(p => [p.id, p.name]));
        const unitsById = new Map(s.units.map(u => [u.id, u.name]));
        const rentalAgreementNoById = new Map(s.rentalAgreements.map(a => [a.id, a.agreementNumber]));
        const projectAgreementNoById = new Map(s.projectAgreements.map(a => [a.id, a.agreementNumber]));
        const invoiceNoById = new Map(s.invoices.map(i => [i.id, i.invoiceNumber]));
        const billNoById = new Map(s.bills.map(b => [b.id, b.billNumber]));
        const contractNoById = new Map((s.contracts || []).map(c => [c.id, c.contractNumber]));

        const getName = (map: Map<string, string>, id?: string | null) => (id ? (map.get(id) || '') : '');
        const getAgreementNumber = (agreementId?: string | null) =>
            (agreementId ? (rentalAgreementNoById.get(agreementId) || projectAgreementNoById.get(agreementId) || '') : '');

        // --- Helpers ---
        const appendSheet = (workbook: XLSX.WorkBook, sheetName: string, headers: string[], rows: any[]) => {
            const ws = rows.length > 0
                ? XLSX.utils.json_to_sheet(rows, { header: headers, skipHeader: false })
                : XLSX.utils.aoa_to_sheet([headers]);
            XLSX.utils.book_append_sheet(workbook, ws, sheetName);
        };

        // Ensure parent entities export before children (so import can resolve parents in a single pass)
        const depthSortByParent = <T extends { id: string; parentAccountId?: string; parentCategoryId?: string }>(
            items: T[],
            parentKey: 'parentAccountId' | 'parentCategoryId'
        ): T[] => {
            const byId = new Map(items.map(i => [i.id, i]));
            const depthCache = new Map<string, number>();
            const depth = (id: string, visited = new Set<string>()): number => {
                if (depthCache.has(id)) return depthCache.get(id)!;
                if (visited.has(id)) return 0; // cycle safety
                visited.add(id);
                const item = byId.get(id);
                const parentId = item?.[parentKey] as string | undefined;
                const d = parentId && byId.has(parentId) ? 1 + depth(parentId, visited) : 0;
                depthCache.set(id, d);
                return d;
            };
            return [...items].sort((a, b) => depth(a.id) - depth(b.id));
        };

        progress.updateProgress(10, 'Building export sheets (import-compatible)...');

        // --- SETTINGS sheet (must be JSON strings; importer safeJsonParse expects that) ---
        const settingsRows = [
            { Key: 'AgreementSettings', Value: safeJson(s.agreementSettings) },
            { Key: 'ProjectAgreementSettings', Value: safeJson(s.projectAgreementSettings) },
            { Key: 'RentalInvoiceSettings', Value: safeJson(s.rentalInvoiceSettings) },
            { Key: 'ProjectInvoiceSettings', Value: safeJson(s.projectInvoiceSettings) },
            { Key: 'PrintSettings', Value: safeJson(s.printSettings) },
            { Key: 'WhatsAppTemplates', Value: safeJson(s.whatsAppTemplates) },
            { Key: 'DashboardConfig', Value: safeJson(s.dashboardConfig) },
            { Key: 'InstallmentPlans', Value: safeJson(s.installmentPlans || []) },
            { Key: 'InvoiceHtmlTemplate', Value: safeJson(s.invoiceHtmlTemplate ?? '') },
            { Key: 'PmCostPercentage', Value: safeJson(s.pmCostPercentage) },
            { Key: 'ShowSystemTransactions', Value: safeJson(s.showSystemTransactions) },
            { Key: 'EnableColorCoding', Value: safeJson(s.enableColorCoding) },
            { Key: 'EnableBeepOnSave', Value: safeJson(s.enableBeepOnSave) },
            { Key: 'LastServiceChargeRun', Value: safeJson(s.lastServiceChargeRun ?? '') },
        ];

        // --- Master Data ---
        const accountsRows = depthSortByParent(s.accounts, 'parentAccountId').map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            balance: a.balance,
            isPermanent: a.isPermanent ?? false,
            description: a.description ?? '',
            parentAccountName: getName(accountsById, a.parentAccountId),
        }));

        const contactsRows = s.contacts.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            description: c.description ?? '',
            contactNo: c.contactNo ?? '',
            companyName: c.companyName ?? '',
            address: c.address ?? '',
        }));

        const categoriesRows = depthSortByParent(s.categories as any, 'parentCategoryId').map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            description: c.description ?? '',
            isPermanent: c.isPermanent ?? false,
            isRental: c.isRental ?? false,
            parentCategoryName: getName(categoriesById, c.parentCategoryId),
        }));

        const projectsRows = s.projects.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            color: p.color ?? '',
            status: p.status ?? '',
            pmConfig: p.pmConfig ? JSON.stringify(p.pmConfig) : '',
            installmentConfig: p.installmentConfig ? JSON.stringify(p.installmentConfig) : '',
        }));

        const buildingsRows = s.buildings.map(b => ({
            id: b.id,
            name: b.name,
            description: b.description ?? '',
            color: b.color ?? '',
        }));

        const propertiesRows = s.properties.map(p => ({
            id: p.id,
            name: p.name,
            ownerName: getName(contactsById, p.ownerId),
            buildingName: getName(buildingsById, p.buildingId),
            description: p.description ?? '',
            monthlyServiceCharge: p.monthlyServiceCharge ?? 0,
        }));

        const unitsRows = s.units.map(u => ({
            id: u.id,
            name: u.name,
            projectName: getName(projectsById, u.projectId),
            ownerName: getName(contactsById, u.contactId),
            salePrice: u.salePrice ?? 0,
            description: u.description ?? '',
        }));

        // --- Staff (legacy) - REMOVED ---

        // --- Agreements / Contracts ---
        const rentalAgreementsRows = s.rentalAgreements.map(a => ({
            id: a.id,
            agreementNumber: a.agreementNumber,
            tenantName: getName(contactsById, a.contactId),
            propertyName: getName(propertiesById, a.propertyId),
            startDate: a.startDate,
            endDate: a.endDate,
            monthlyRent: a.monthlyRent,
            rentDueDate: a.rentDueDate,
            status: a.status,
            description: a.description ?? '',
            securityDeposit: a.securityDeposit ?? 0,
            brokerName: getName(contactsById, a.brokerId),
            brokerFee: a.brokerFee ?? 0,
        }));

        const projectAgreementsRows = s.projectAgreements.map(a => ({
            id: a.id,
            agreementNumber: a.agreementNumber,
            clientName: getName(contactsById, a.clientId),
            projectName: getName(projectsById, a.projectId),
            UnitNames: (a.unitIds || []).map(uid => getName(unitsById, uid)).filter(Boolean).join(', '),
            issueDate: a.issueDate,
            status: a.status,
            description: a.description ?? '',
            cancellationDetails: a.cancellationDetails ? JSON.stringify(a.cancellationDetails) : '',
            listPrice: a.listPrice ?? 0,
            customerDiscount: a.customerDiscount ?? 0,
            floorDiscount: a.floorDiscount ?? 0,
            lumpSumDiscount: a.lumpSumDiscount ?? 0,
            miscDiscount: a.miscDiscount ?? 0,
            sellingPrice: a.sellingPrice ?? 0,
            rebateAmount: a.rebateAmount ?? 0,
            rebateBrokerName: getName(contactsById, a.rebateBrokerId),
            listPriceCategoryName: getName(categoriesById, a.listPriceCategoryId),
            customerDiscountCategoryName: getName(categoriesById, a.customerDiscountCategoryId),
            floorDiscountCategoryName: getName(categoriesById, a.floorDiscountCategoryId),
            lumpSumDiscountCategoryName: getName(categoriesById, a.lumpSumDiscountCategoryId),
            miscDiscountCategoryName: getName(categoriesById, a.miscDiscountCategoryId),
            sellingPriceCategoryName: getName(categoriesById, a.sellingPriceCategoryId),
            rebateCategoryName: getName(categoriesById, a.rebateCategoryId),
        }));

        const contractsRows = (s.contracts || []).map(c => {
            // Export expense category items as separate comma-separated columns
            const expenseCategoryNames: string[] = [];
            const expenseQuantities: string[] = [];
            const expensePricePerUnits: string[] = [];
            const expenseNetValues: string[] = [];
            const expenseUnits: string[] = [];
            
            if (c.expenseCategoryItems && c.expenseCategoryItems.length > 0) {
                c.expenseCategoryItems.forEach(item => {
                    expenseCategoryNames.push(getName(categoriesById, item.categoryId));
                    expenseQuantities.push(String(item.quantity ?? 1));
                    expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                    expenseNetValues.push(String(item.netValue ?? 0));
                    expenseUnits.push(item.unit || 'quantity');
                });
            }
            
            return {
                id: c.id,
                contractNumber: c.contractNumber,
                name: c.name,
                projectName: getName(projectsById, c.projectId),
                vendorName: getName(contactsById, c.vendorId),
                totalAmount: c.totalAmount,
                area: c.area ?? '',
                rate: c.rate ?? '',
                startDate: c.startDate,
                endDate: c.endDate,
                status: c.status,
                categoryNames: (c.categoryIds || []).map(cid => getName(categoriesById, cid)).filter(Boolean).join(', '),
                expenseCategoryNames: expenseCategoryNames.join(', '),
                expenseQuantities: expenseQuantities.join(', '),
                expensePricePerUnits: expensePricePerUnits.join(', '),
                expenseNetValues: expenseNetValues.join(', '),
                expenseUnits: expenseUnits.join(', '),
                paymentTerms: c.paymentTerms ?? '',
                termsAndConditions: c.termsAndConditions ?? '',
                description: c.description ?? '',
            };
        });

        // --- Recurring Templates ---
        const recurringRows = s.recurringInvoiceTemplates.map(t => ({
            id: t.id,
            contactName: getName(contactsById, t.contactId),
            propertyName: getName(propertiesById, t.propertyId),
            buildingName: getName(buildingsById, t.buildingId),
            agreementNumber: getAgreementNumber(t.agreementId),
            amount: t.amount,
            descriptionTemplate: t.descriptionTemplate ?? '',
            dayOfMonth: t.dayOfMonth,
            nextDueDate: t.nextDueDate,
            active: t.active,
        }));

        // --- Invoices / Bills ---
        const invoicesRows = s.invoices.map(i => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            contactName: getName(contactsById, i.contactId),
            amount: i.amount,
            paidAmount: i.paidAmount ?? 0,
            status: i.status,
            issueDate: i.issueDate,
            dueDate: i.dueDate,
            invoiceType: i.invoiceType,
            description: i.description ?? '',
            projectName: getName(projectsById, i.projectId),
            buildingName: getName(buildingsById, i.buildingId),
            propertyName: getName(propertiesById, i.propertyId),
            unitName: getName(unitsById, i.unitId),
            categoryName: getName(categoriesById, i.categoryId),
            agreementNumber: getAgreementNumber(i.agreementId),
            securityDepositCharge: i.securityDepositCharge ?? '',
            serviceCharges: i.serviceCharges ?? '',
            rentalMonth: i.rentalMonth ?? '',
        }));

        const getBillKind = (billId?: string): 'rental' | 'project' | 'unknown' => {
            if (!billId) return 'unknown';
            const b = s.bills.find(x => x.id === billId);
            if (!b) return 'unknown';
            if (b.projectId || b.contractId || b.projectAgreementId) return 'project';
            if (b.buildingId || b.propertyId || b.staffId) return 'rental';
            return 'unknown';
        };

        const projectBillsRows = s.bills
            .filter(b => getBillKind(b.id) === 'project')
            .map(b => {
                // Export expense category items as separate comma-separated columns
                const expenseCategoryNames: string[] = [];
                const expenseQuantities: string[] = [];
                const expensePricePerUnits: string[] = [];
                const expenseNetValues: string[] = [];
                const expenseUnits: string[] = [];
                
                if (b.expenseCategoryItems && b.expenseCategoryItems.length > 0) {
                    b.expenseCategoryItems.forEach(item => {
                        expenseCategoryNames.push(getName(categoriesById, item.categoryId));
                        expenseQuantities.push(String(item.quantity ?? 1));
                        expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                        expenseNetValues.push(String(item.netValue ?? 0));
                        expenseUnits.push(item.unit || 'quantity');
                    });
                }
                
                return {
                    id: b.id,
                    billNumber: b.billNumber,
                    contactName: getName(contactsById, b.contactId),
                    amount: b.amount,
                    paidAmount: b.paidAmount ?? 0,
                    status: b.status,
                    issueDate: b.issueDate,
                    dueDate: b.dueDate ?? '',
                    description: b.description ?? '',
                    categoryName: getName(categoriesById, b.categoryId),
                    projectName: getName(projectsById, b.projectId),
                    contractNumber: getName(contractNoById, b.contractId),
                    agreementNumber: getName(projectAgreementNoById, b.projectAgreementId),
                    projectAgreementId: b.projectAgreementId ?? '',
                    expenseCategoryNames: expenseCategoryNames.join(', '),
                    expenseQuantities: expenseQuantities.join(', '),
                    expensePricePerUnits: expensePricePerUnits.join(', '),
                    expenseNetValues: expenseNetValues.join(', '),
                    expenseUnits: expenseUnits.join(', '),
                };
            });

        const rentalBillsRows = s.bills
            .filter(b => getBillKind(b.id) === 'rental')
            .map(b => {
                // Export expense category items as separate comma-separated columns
                const expenseCategoryNames: string[] = [];
                const expenseQuantities: string[] = [];
                const expensePricePerUnits: string[] = [];
                const expenseNetValues: string[] = [];
                const expenseUnits: string[] = [];
                
                if (b.expenseCategoryItems && b.expenseCategoryItems.length > 0) {
                    b.expenseCategoryItems.forEach(item => {
                        expenseCategoryNames.push(getName(categoriesById, item.categoryId));
                        expenseQuantities.push(String(item.quantity ?? 1));
                        expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                        expenseNetValues.push(String(item.netValue ?? 0));
                        expenseUnits.push(item.unit || 'quantity');
                    });
                }
                
                return {
                    id: b.id,
                    billNumber: b.billNumber,
                    contactName: getName(vendorsById, b.vendorId) || getName(contactsById, b.contactId),
                    amount: b.amount,
                    paidAmount: b.paidAmount ?? 0,
                    status: b.status,
                    issueDate: b.issueDate,
                    dueDate: b.dueDate ?? '',
                    description: b.description ?? '',
                    categoryName: getName(categoriesById, b.categoryId),
                    buildingName: getName(buildingsById, b.buildingId),
                    propertyName: getName(propertiesById, b.propertyId),
                    staffName: getName(contactsById, b.staffId),
                    staffId: b.staffId ?? '',
                    expenseBearerType: b.expenseBearerType ?? '',
                    expenseCategoryNames: expenseCategoryNames.join(', '),
                    expenseQuantities: expenseQuantities.join(', '),
                    expensePricePerUnits: expensePricePerUnits.join(', '),
                    expenseNetValues: expenseNetValues.join(', '),
                    expenseUnits: expenseUnits.join(', '),
                };
            });

        // Legacy/combined bills sheet (kept for compatibility) - only rental bills to avoid duplication with ProjectBills
        const billsRows = s.bills
            .filter(b => getBillKind(b.id) === 'rental') // Exclude project bills to avoid duplication
            .map(b => {
                // Export expense category items as separate comma-separated columns
                const expenseCategoryNames: string[] = [];
                const expenseQuantities: string[] = [];
                const expensePricePerUnits: string[] = [];
                const expenseNetValues: string[] = [];
                const expenseUnits: string[] = [];
                
                if (b.expenseCategoryItems && b.expenseCategoryItems.length > 0) {
                    b.expenseCategoryItems.forEach(item => {
                        expenseCategoryNames.push(getName(categoriesById, item.categoryId));
                        expenseQuantities.push(String(item.quantity ?? 1));
                        expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                        expenseNetValues.push(String(item.netValue ?? 0));
                        expenseUnits.push(item.unit || 'quantity');
                    });
                }
                
                return {
                    id: b.id,
                    billNumber: b.billNumber,
                    contactName: getName(vendorsById, b.vendorId) || getName(contactsById, b.contactId),
                    amount: b.amount,
                    paidAmount: b.paidAmount ?? 0,
                    status: b.status,
                    issueDate: b.issueDate,
                    dueDate: b.dueDate ?? '',
                    description: b.description ?? '',
                    categoryName: getName(categoriesById, b.categoryId),
                    projectName: getName(projectsById, b.projectId),
                    buildingName: getName(buildingsById, b.buildingId),
                    propertyName: getName(propertiesById, b.propertyId),
                    contractNumber: getName(contractNoById, b.contractId),
                    agreementNumber: getName(projectAgreementNoById, b.projectAgreementId),
                    projectAgreementId: b.projectAgreementId ?? '',
                    contractId: b.contractId ?? '',
                    staffId: b.staffId ?? '',
                    expenseBearerType: b.expenseBearerType ?? '',
                    expenseCategoryNames: expenseCategoryNames.join(', '),
                    expenseQuantities: expenseQuantities.join(', '),
                    expensePricePerUnits: expensePricePerUnits.join(', '),
                    expenseNetValues: expenseNetValues.join(', '),
                    expenseUnits: expenseUnits.join(', '),
                };
            });

        // --- Budgets ---
        const budgetsRows = s.budgets.map(b => ({
            id: b.id,
            categoryId: b.categoryId,
            categoryName: getName(categoriesById, b.categoryId),
            projectId: b.projectId || '',
            projectName: b.projectId ? getName(projectsById, b.projectId) : '',
            amount: b.amount,
        }));


        // --- Transactions (combined + split sheets) ---
        const rentalAgreementIds = new Set(s.rentalAgreements.map(a => a.id));
        const projectAgreementIds = new Set(s.projectAgreements.map(a => a.id));

        const getInvoiceKind = (invoiceId?: string): 'rental' | 'project' | 'unknown' => {
            if (!invoiceId) return 'unknown';
            const inv = s.invoices.find(x => x.id === invoiceId);
            if (!inv) return 'unknown';
            if (inv.invoiceType === InvoiceType.INSTALLMENT) return 'project';
            if (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || inv.invoiceType === InvoiceType.SERVICE_CHARGE) return 'rental';
            if (inv.agreementId) {
                if (rentalAgreementIds.has(inv.agreementId)) return 'rental';
                if (projectAgreementIds.has(inv.agreementId)) return 'project';
            }
            if (inv.propertyId || inv.buildingId) return 'rental';
            if (inv.projectId || inv.unitId) return 'project';
            return 'unknown';
        };

        // Filter out bill payments, invoice payments, loan transactions, and transfer transactions
        // from the main Transactions sheet since they are exported separately in their respective sheets
        const txRows = s.transactions
            .filter(tx => !tx.billId && !tx.invoiceId && tx.type !== TransactionType.LOAN && tx.type !== TransactionType.TRANSFER) // Exclude bill payments, invoice payments, loans, and transfers
            .map(tx => ({
                id: tx.id,
                type: tx.type,
                subtype: tx.subtype ?? '',
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                fromAccountName: getName(accountsById, tx.fromAccountId),
                toAccountName: getName(accountsById, tx.toAccountId),
                contactName: getName(contactsById, tx.contactId),
                projectName: getName(projectsById, tx.projectId),
                buildingName: getName(buildingsById, tx.buildingId),
                propertyName: getName(propertiesById, tx.propertyId),
                unitName: getName(unitsById, tx.unitId),
                categoryName: getName(categoriesById, tx.categoryId),
                invoiceNumber: getName(invoiceNoById, tx.invoiceId),
                billNumber: getName(billNoById, tx.billId),
                contractNumber: getName(contractNoById, tx.contractId),
                agreementNumber: getAgreementNumber(tx.agreementId),
                batchId: tx.batchId ?? '',
            }));

        const rentalInvoicePaymentsRows = s.transactions
            .filter(tx => tx.type === TransactionType.INCOME && !!tx.invoiceId && getInvoiceKind(tx.invoiceId) === 'rental')
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                invoiceNumber: getName(invoiceNoById, tx.invoiceId),
            }));

        const projectInvoicePaymentsRows = s.transactions
            .filter(tx => tx.type === TransactionType.INCOME && !!tx.invoiceId && getInvoiceKind(tx.invoiceId) === 'project')
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                invoiceNumber: getName(invoiceNoById, tx.invoiceId),
            }));

        const rentalBillPaymentsRows = s.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE && !!tx.billId && getBillKind(tx.billId) === 'rental')
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                billNumber: getName(billNoById, tx.billId),
            }));

        const projectBillPaymentsRows = s.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE && !!tx.billId && getBillKind(tx.billId) === 'project')
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                billNumber: getName(billNoById, tx.billId),
            }));

        const loanTxRows = s.transactions
            .filter(tx => tx.type === TransactionType.LOAN)
            .map(tx => ({
                id: tx.id,
                subtype: tx.subtype ?? LoanSubtype.RECEIVE,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                contactName: getName(contactsById, tx.contactId),
            }));

        // Identify equity accounts
        const equityAccountIds = new Set(s.accounts.filter(a => a.type === AccountType.EQUITY).map(a => a.id));
        
        // Equity transactions: TRANSFER transactions involving equity accounts
        const equityTransactionsRows = s.transactions
            .filter(tx => tx.type === TransactionType.TRANSFER && 
                         (equityAccountIds.has(tx.fromAccountId || '') || equityAccountIds.has(tx.toAccountId || '')))
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                fromAccountName: getName(accountsById, tx.fromAccountId),
                toAccountName: getName(accountsById, tx.toAccountId),
                projectName: getName(projectsById, tx.projectId),
                projectId: tx.projectId ?? '',
            }));

        // Regular transfer transactions (excluding equity transactions)
        const transferTxRows = s.transactions
            .filter(tx => tx.type === TransactionType.TRANSFER && 
                         !equityAccountIds.has(tx.fromAccountId || '') && 
                         !equityAccountIds.has(tx.toAccountId || ''))
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                fromAccountName: getName(accountsById, tx.fromAccountId),
                toAccountName: getName(accountsById, tx.toAccountId),
            }));

        const standaloneIncomeRows = s.transactions
            .filter(tx => tx.type === TransactionType.INCOME && !tx.invoiceId)
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                contactName: getName(contactsById, tx.contactId),
                categoryName: getName(categoriesById, tx.categoryId),
                projectName: getName(projectsById, tx.projectId),
            }));

        const standaloneExpenseRows = s.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE && !tx.billId)
            .map(tx => ({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(accountsById, tx.accountId),
                contactName: getName(contactsById, tx.contactId),
                categoryName: getName(categoriesById, tx.categoryId),
            }));

        // --- Workbook assembly (sheet tabs align with importService allowed schemas) ---
        const workbook = XLSX.utils.book_new();

        const sheets: Array<{ name: string; headers: string[]; rows: any[] }> = [
            { name: 'Settings', headers: ['Key', 'Value'], rows: settingsRows },
            { name: 'Accounts', headers: ['id', 'name', 'type', 'balance', 'isPermanent', 'description', 'parentAccountName'], rows: accountsRows },
            { name: 'Contacts', headers: ['id', 'name', 'type', 'description', 'contactNo', 'companyName', 'address'], rows: contactsRows },
            { name: 'Categories', headers: ['id', 'name', 'type', 'description', 'isPermanent', 'isRental', 'parentCategoryName'], rows: categoriesRows },
            { name: 'Projects', headers: ['id', 'name', 'description', 'color', 'status', 'pmConfig', 'installmentConfig'], rows: projectsRows },
            { name: 'Buildings', headers: ['id', 'name', 'description', 'color'], rows: buildingsRows },
            { name: 'Properties', headers: ['id', 'name', 'ownerName', 'buildingName', 'description', 'monthlyServiceCharge'], rows: propertiesRows },
            { name: 'Units', headers: ['id', 'name', 'projectName', 'ownerName', 'salePrice', 'description'], rows: unitsRows },
            { name: 'RentalAgreements', headers: ['id', 'agreementNumber', 'tenantName', 'propertyName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate', 'status', 'description', 'securityDeposit', 'brokerName', 'brokerFee'], rows: rentalAgreementsRows },
            { name: 'ProjectAgreements', headers: ['id', 'agreementNumber', 'clientName', 'projectName', 'UnitNames', 'issueDate', 'status', 'description', 'cancellationDetails', 'listPrice', 'customerDiscount', 'floorDiscount', 'lumpSumDiscount', 'miscDiscount', 'sellingPrice', 'rebateAmount', 'rebateBrokerName', 'listPriceCategoryName', 'customerDiscountCategoryName', 'floorDiscountCategoryName', 'lumpSumDiscountCategoryName', 'miscDiscountCategoryName', 'sellingPriceCategoryName', 'rebateCategoryName'], rows: projectAgreementsRows },
            { name: 'Contracts', headers: ['id', 'contractNumber', 'name', 'projectName', 'vendorName', 'totalAmount', 'area', 'rate', 'startDate', 'endDate', 'status', 'categoryNames', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits', 'paymentTerms', 'termsAndConditions', 'description'], rows: contractsRows },
            { name: 'RecurringTemplates', headers: ['id', 'contactName', 'propertyName', 'buildingName', 'agreementNumber', 'amount', 'descriptionTemplate', 'dayOfMonth', 'nextDueDate', 'active'], rows: recurringRows },
            { name: 'Invoices', headers: ['id', 'invoiceNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'invoiceType', 'description', 'projectName', 'buildingName', 'propertyName', 'unitName', 'categoryName', 'agreementNumber', 'securityDepositCharge', 'serviceCharges', 'rentalMonth'], rows: invoicesRows },
            { name: 'ProjectBills', headers: ['id', 'billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'contractNumber', 'agreementNumber', 'projectAgreementId', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits'], rows: projectBillsRows },
            { name: 'RentalBills', headers: ['id', 'billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'buildingName', 'propertyName', 'staffName', 'staffId', 'expenseBearerType', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits'], rows: rentalBillsRows },
            { name: 'Bills', headers: ['id', 'billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'projectAgreementId', 'agreementNumber', 'contractId', 'contractNumber', 'staffId', 'expenseBearerType', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits'], rows: billsRows },
            { name: 'RentalInvoicePayments', headers: ['id', 'amount', 'date', 'description', 'accountName', 'invoiceNumber'], rows: rentalInvoicePaymentsRows },
            { name: 'ProjectInvoicePayments', headers: ['id', 'amount', 'date', 'description', 'accountName', 'invoiceNumber'], rows: projectInvoicePaymentsRows },
            { name: 'RentalBillPayments', headers: ['id', 'amount', 'date', 'description', 'accountName', 'billNumber'], rows: rentalBillPaymentsRows },
            { name: 'ProjectBillPayments', headers: ['id', 'amount', 'date', 'description', 'accountName', 'billNumber'], rows: projectBillPaymentsRows },
            { name: 'LoanTransactions', headers: ['id', 'subtype', 'amount', 'date', 'description', 'accountName', 'contactName'], rows: loanTxRows },
            { name: 'EquityTransactions', headers: ['id', 'amount', 'date', 'description', 'fromAccountName', 'toAccountName', 'projectName', 'projectId'], rows: equityTransactionsRows },
            { name: 'TransferTransactions', headers: ['id', 'amount', 'date', 'description', 'fromAccountName', 'toAccountName'], rows: transferTxRows },
            { name: 'IncomeTransactions', headers: ['id', 'amount', 'date', 'description', 'accountName', 'contactName', 'categoryName', 'projectName'], rows: standaloneIncomeRows },
            { name: 'ExpenseTransactions', headers: ['id', 'amount', 'date', 'description', 'accountName', 'contactName', 'categoryName'], rows: standaloneExpenseRows },
            { name: 'Budgets', headers: ['id', 'categoryId', 'categoryName', 'projectId', 'projectName', 'amount'], rows: budgetsRows },
            { name: 'Transactions', headers: ['id', 'type', 'subtype', 'amount', 'date', 'description', 'accountName', 'fromAccountName', 'toAccountName', 'contactName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'categoryName', 'invoiceNumber', 'billNumber', 'contractNumber', 'agreementNumber', 'batchId'], rows: txRows },
        ];

        sheets.forEach(sh => appendSheet(workbook, sh.name, sh.headers, sh.rows));

        progress.updateProgress(90, 'Generating file...');
        await new Promise(res => setTimeout(res, 50));

        XLSX.writeFile(workbook, filename);
        progress.finishProgress('Export complete! File is ready for use.');

    } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        progress.errorProgress(`Export failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Export Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
}

export const exportJsonToExcel = (data: any[], filename: string, sheetName: string = 'Sheet1') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
};

export const exportLogToExcel = (log: ImportLogEntry[], filename: string) => {
    exportJsonToExcel(log, filename, 'Import Log');
};
