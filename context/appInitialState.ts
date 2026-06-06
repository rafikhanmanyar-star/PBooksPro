import type { AppState, Account, Category, User } from '../types';
import { MANDATORY_SYSTEM_ACCOUNTS } from '../services/database/mandatorySystemAccounts';
import { MANDATORY_SYSTEM_CATEGORIES } from '../services/database/mandatorySystemCategories';

const SYSTEM_ACCOUNTS: Account[] = MANDATORY_SYSTEM_ACCOUNTS;

const DEFAULT_ADMIN: User = {
    id: 'sys-admin',
    username: 'admin',
    name: 'Administrator',
    role: 'Admin',
    password: '' // Empty string signifies no password set
};

const SYSTEM_CATEGORIES: Category[] = MANDATORY_SYSTEM_CATEGORIES;

const DEFAULT_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Work+Sans:wght@400;500;600;700&display=swap');
        body { font-family: 'Nunito', 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; padding: 40px; color: #374151; line-height: 1.5; max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 60px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; }
        .company-info h1 { margin: 0; color: #4f46e5; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
        .company-info p { margin: 4px 0; font-size: 14px; color: #64748b; white-space: pre-line; }
        .logo-container img { max-height: 80px; width: auto; margin-bottom: 10px; }
        .invoice-title { text-align: right; }
        .invoice-title h2 { margin: 0; font-size: 32px; color: #1e293b; font-weight: 800; letter-spacing: -1px; }
        .invoice-meta { margin-top: 10px; font-size: 14px; }
        .meta-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 4px; }
        .label { color: #64748b; font-weight: 600; }
        .value { font-weight: 500; }
        
        .bill-to-section { margin-bottom: 40px; display: flex; justify-content: space-between; }
        .bill-to h3 { font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 8px; }
        .bill-to p { margin: 2px 0; font-weight: 500; color: #0f172a; }
        .client-name { font-size: 18px; font-weight: 700; margin-bottom: 4px !important; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
        th { text-align: left; padding: 12px 16px; background-color: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
        td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .amount-col { text-align: right; font-weight: 600; color: #0f172a; width: 150px; }
        
        .totals-section { display: flex; justify-content: flex-end; }
        .totals-table { width: 300px; border-collapse: collapse; }
        .totals-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .totals-table .total-row td { border-top: 2px solid #0f172a; border-bottom: none; padding-top: 12px; font-size: 16px; font-weight: 700; color: #0f172a; }
        .totals-table .label { color: #64748b; }
        .totals-table .value { text-align: right; }
        
        .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; }
        
        .status-stamp { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); border: 4px solid rgba(220, 38, 38, 0.2); color: rgba(220, 38, 38, 0.2); font-size: 80px; font-weight: 900; text-transform: uppercase; padding: 20px; pointer-events: none; z-index: -1; font-family: 'Nunito', 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .status-paid { border-color: rgba(16, 185, 129, 0.2); color: rgba(16, 185, 129, 0.2); }
        .barcode { font-family: 'IDAutomationHC39M', 'Courier New', 'Courier', monospace; font-weight: normal; letter-spacing: 0.15em; font-size: 1.1em; }
    </style>
</head>
<body>
    {statusStamp}
    
    <div class="header">
        <div class="company-info">
            <div class="logo-container">{logoImg}</div>
            <h1>{companyName}</h1>
            <p>{companyAddress}</p>
            <p>{companyContact}</p>
        </div>
        <div class="invoice-title">
            <h2>INVOICE</h2>
            <div class="invoice-meta">
                <div class="meta-row"><span class="label">Invoice #</span> <span class="value">{invoiceNumber}</span></div>
                <div class="meta-row"><span class="label">Date</span> <span class="value">{issueDate}</span></div>
                <div class="meta-row"><span class="label">Due Date</span> <span class="value">{dueDate}</span></div>
            </div>
        </div>
    </div>

    <div class="bill-to-section">
        <div class="bill-to">
            <h3>Bill To</h3>
            <p class="client-name">{contactName}</p>
            <p>{contactPhone}</p>
            <p>{contactAddress}</p>
        </div>
        <div class="bill-to" style="text-align: right;">
            <h3>Property / Unit</h3>
            <p class="client-name">{contextName}</p>
            <p>{contextSub}</p>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th class="amount-col">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <strong>{invoiceType}</strong>
                    <div style="font-size: 13px; color: #64748b; margin-top: 4px;">{description}</div>
                </td>
                <td class="amount-col">{amount}</td>
            </tr>
            {extraRows}
        </tbody>
    </table>

    <div class="totals-section">
        <table class="totals-table">
            <tr>
                <td class="label">Subtotal</td>
                <td class="value">{amount}</td>
            </tr>
            <tr>
                <td class="label">Amount Paid</td>
                <td class="value" style="color: #10b981;">{paidAmount}</td>
            </tr>
            <tr class="total-row">
                <td>Balance Due</td>
                <td class="value">{balanceDue}</td>
            </tr>
        </table>
    </div>

    <div class="footer">
        <p>{footerText}</p>
        <p>Thank you for your business!</p>
    </div>
</body>
</html>`;

const initialState: AppState = {
    users: [DEFAULT_ADMIN],
    currentUser: null,
    accounts: SYSTEM_ACCOUNTS,
    contacts: [],
    vendors: [],
    categories: SYSTEM_CATEGORIES,
    projects: [],
    buildings: [],
    properties: [],
    units: [],
    transactions: [],
    invoices: [],
    bills: [],
    rentalAgreements: [],
    projectAgreements: [],
    salesReturns: [],
    projectReceivedAssets: [],
    contracts: [],
    budgets: [],
    personalCategories: [],
    personalTransactions: [],
    cashFlowCategoryMappings: [],
    recurringInvoiceTemplates: [],
    printSettings: {
        companyName: 'My Company',
        companyAddress: '',
        companyContact: '',
        showLogo: true,
        showDatePrinted: true
    },
    whatsAppTemplates: {
        invoiceReminder: 'Dear {contactName}, Invoice #{invoiceNumber} for {subject} is due on {dueDate}. Amount: {amount}.',
        invoiceReceipt: 'Dear {contactName}, Payment of {paidAmount} received for Invoice #{invoiceNumber}. Balance: {balance}. Your total unpaid amount is {totalUnpaid}. Please clear your dues.',
        billPayment: 'Dear {contactName}, Bill #{billNumber} has been paid. Amount: {paidAmount}.',
        billToOwner: 'Dear {contactName}, Maintenance bill #{billNumber} for your property. Amount: {amount}.',
        billToTenant: 'Dear {contactName}, Maintenance bill #{billNumber}. Amount: {amount}. {note}',
        vendorGreeting: 'Hello {contactName},',
        ownerPayoutLedger: 'Dear {contactName},\n\nHere is your {payoutType} statement:\n\nCollected: {collected}\nExpenses: {expenses}\nPaid to you: {paid}\n─────────────\nBalance Due: {balance}\n\nFor any queries, please contact us.',
        brokerPayoutLedger: 'Dear {contactName},\n\nHere is your commission statement:\n\nTotal Earned: {earned}\nTotal Paid: {paid}\n─────────────\nBalance Due: {balance}\n\nFor any queries, please contact us.',
        payoutConfirmation: 'Dear {contactName},\n\nA {payoutType} payment of {amount} has been made to you.\nReference: {reference}\n\nThank you.',
    },
    invoiceHtmlTemplate: DEFAULT_INVOICE_TEMPLATE,
    dashboardConfig: { visibleKpis: [] },
    accountConsistency: { actualByAccountId: {} },
    installmentPlans: [],
    planAmenities: [],
    agreementSettings: { prefix: 'AGR-', nextNumber: 1, padding: 4 },
    projectAgreementSettings: { prefix: 'P-AGR-', nextNumber: 1, padding: 4 },
    rentalInvoiceSettings: { prefix: 'INV-', nextNumber: 1, padding: 5, autoSendInvoiceWhatsApp: false },
    projectInvoiceSettings: { prefix: 'P-INV-', nextNumber: 1, padding: 5, autoSendBillPaymentWhatsApp: false },
    showSystemTransactions: false,
    enableColorCoding: true,
    enableBeepOnSave: false,
    enableDatePreservation: false,
    lastPreservedDate: undefined,
    pmCostPercentage: 0,
    defaultProjectId: undefined,
    errorLog: [],
    transactionLog: [],
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
    initialImportType: null,
    quotations: [],
    documents: [],
    pmCycleAllocations: [],
    whatsAppMode: 'api',
}
