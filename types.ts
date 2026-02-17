import { ReactNode } from 'react';

export type Page =
  | 'dashboard'
  | 'transactions'
  | 'payments'
  | 'loans'
  | 'vendorDirectory'
  | 'contacts'
  | 'budgets'
  | 'rentalManagement'
  | 'rentalInvoices'
  | 'rentalAgreements'
  | 'ownerPayouts'
  | 'projectManagement'
  | 'projectSelling'
  | 'projectInvoices'
  | 'bills'
  | 'investmentManagement'
  | 'pmConfig'
  | 'settings'
  | 'import'
  | 'tasks'
  | 'tasksCalendar'
  | 'teamRanking'
  | 'taskCreation'
  | 'taskAssignment'
  | 'taskWorkflow'
  | 'taskExecution'
  | 'taskDashboards'
  | 'taskKPIs'
  | 'taskNotifications'
  | 'taskAutomation'
  | 'taskReports'
  | 'taskConfiguration'
  | 'taskAudit'
  | 'taskOKR'
  | 'taskInitiatives'
  | 'taskRoles'
  | 'taskManagement'

  | 'bizPlanet'
  | 'marketing'
  | 'payroll'
  | 'posSales'
  | 'inventory'
  | 'accounting'
  | 'loyalty'
  | 'multiStore'
  | 'procurement'
  | 'biDashboards';

export enum TransactionType {
  INCOME = 'Income',
  EXPENSE = 'Expense',
  TRANSFER = 'Transfer',
  LOAN = 'Loan',
}

export enum LoanSubtype {
  GIVE = 'Give Loan',
  RECEIVE = 'Receive Loan',
  REPAY = 'Repay Loan',
  COLLECT = 'Collect Loan',
}

export enum AccountType {
  BANK = 'Bank',
  CASH = 'Cash',
  ASSET = 'Asset',
  LIABILITY = 'Liability',
  EQUITY = 'Equity',
}

export enum ContactType {
  OWNER = 'Owner',
  TENANT = 'Tenant',
  STAFF = 'Staff',
  BROKER = 'Broker',
  DEALER = 'Dealer',
  FRIEND_FAMILY = 'Friend & Family',
  CLIENT = 'Client',
  LEAD = 'Lead',
  VENDOR = 'Vendor',
}

export enum InvoiceStatus {
  UNPAID = 'Unpaid',
  PAID = 'Paid',
  PARTIALLY_PAID = 'Partially Paid',
  OVERDUE = 'Overdue',
  DRAFT = 'Draft',
}

export enum InvoiceType {
  RENTAL = 'Rental',
  SECURITY_DEPOSIT = 'Security Deposit',
  SERVICE_CHARGE = 'Service Charge',
  INSTALLMENT = 'Installment',
}

export enum RentalAgreementStatus {
  ACTIVE = 'Active',
  TERMINATED = 'Terminated',
  EXPIRED = 'Expired',
  RENEWED = 'Renewed',
}

export enum ProjectAgreementStatus {
  ACTIVE = 'Active',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed',
}

export enum SalesReturnStatus {
  PENDING = 'Pending',
  PROCESSED = 'Processed',
  REFUNDED = 'Refunded',
  CANCELLED = 'Cancelled',
}

export enum SalesReturnReason {
  CUSTOMER_REQUEST = 'Customer Request',
  DEFECT_QUALITY = 'Defect/Quality Issue',
  CONTRACT_BREACH = 'Contract Breach',
  MUTUAL_AGREEMENT = 'Mutual Agreement',
  OTHER = 'Other',
}

export enum ContractStatus {
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  TERMINATED = 'Terminated',
}

export type LedgerSortKey = 'date' | 'type' | 'description' | 'amount' | 'account' | 'category' | 'contact' | 'balance';
export type SortDirection = 'asc' | 'desc';

export interface FilterCriteria {
  searchQuery: string;
  startDate: string;
  endDate: string;
  type: string;
  accountId: string;
  categoryId: string;
  contactId: string;
  projectId: string;
  buildingId: string;
  minAmount: string;
  maxAmount: string;
  groupBy: 'none' | 'date' | 'type' | 'account' | 'category' | 'contact';
}

export enum ImportType {
  FULL = 'full',
  ACCOUNTS = 'accounts',
  CONTACTS = 'contacts',
  VENDORS = 'vendors',
  CATEGORIES = 'categories',
  PROJECTS = 'projects',
  BUILDINGS = 'buildings',
  PROPERTIES = 'properties',
  UNITS = 'units',
  AGREEMENTS = 'agreements',
  RENTAL_AGREEMENTS = 'rental_agreements',
  PROJECT_AGREEMENTS = 'project_agreements',
  CONTRACTS = 'contracts',
  INVOICES = 'invoices',
  BILLS = 'bills',
  PROJECT_BILLS = 'project_bills',
  RENTAL_BILLS = 'rental_bills',
  PAYMENTS = 'payments',
  RENTAL_INVOICE_PAYMENTS = 'rental_invoice_payments',
  PROJECT_INVOICE_PAYMENTS = 'project_invoice_payments',
  RENTAL_BILL_PAYMENTS = 'rental_bill_payments',
  PROJECT_BILL_PAYMENTS = 'project_bill_payments',
  LOAN_TRANSACTIONS = 'loan_transactions',
  EQUITY_TRANSACTIONS = 'equity_transactions',
  TRANSFER_TRANSACTIONS = 'transfer_transactions',
  INCOME_TRANSACTIONS = 'income_transactions',
  EXPENSE_TRANSACTIONS = 'expense_transactions',
  RECURRING_TEMPLATES = 'recurring_templates',
  BUDGETS = 'budgets'
}



export type UserRole =
  // Administrative Roles
  | 'Admin'
  | 'Manager'
  | 'Accounts'
  // POS & Shop Roles  
  | 'Store Manager'
  | 'Cashier'
  | 'Inventory Manager'
  // Task & Performance Roles
  | 'Project Manager'
  | 'Team Lead'
  | 'Task Contributor';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  isPermanent?: boolean;
  description?: string;
  parentAccountId?: string;
  children?: Account[];
}

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  description?: string;
  contactNo?: string;
  companyName?: string;
  address?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  description?: string;
  contactNo?: string;
  companyName?: string;
  address?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  description?: string;
  isPermanent?: boolean;
  isRental?: boolean;
  parentCategoryId?: string;
}

export interface Building {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface Property {
  id: string;
  name: string;
  ownerId: string;
  buildingId: string;
  description?: string;
  monthlyServiceCharge?: number;
}

export type ProjectStatus = 'Active' | 'Completed' | 'On Hold';
export type InstallmentFrequency = 'Monthly' | 'Quarterly' | 'Yearly';

export interface InstallmentPlanDiscount {
  id: string;
  name: string;
  amount: number;
  categoryId?: string;
}

export interface InstallmentPlan {
  id: string;
  projectId: string;
  leadId: string;
  unitId: string;
  durationYears: number;
  downPaymentPercentage: number;
  frequency: InstallmentFrequency;
  listPrice: number;
  discounts: InstallmentPlanDiscount[];
  netValue: number;
  downPaymentAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  description?: string;
  introText?: string; // Custom editable text after "Exclusively for You"
  version: number;
  rootId?: string; // ID of the first version of this plan
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Locked' | 'Sale Recognized';
  approvalRequestedById?: string;
  approvalRequestedToId?: string;
  approvalRequestedAt?: string;
  approvalReviewedById?: string;
  approvalReviewedAt?: string;
  userId?: string;
  // Selected amenities with their calculated amounts
  selectedAmenities?: InstallmentPlanAmenity[];
  amenitiesTotal?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlanAmenity {
  id: string;
  name: string;
  price: number;
  isPercentage: boolean; // If true, price is % of list price; if false, it's a fixed amount
  isActive: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InstallmentPlanAmenity {
  amenityId: string;
  amenityName: string;
  calculatedAmount: number; // The actual amount applied (fixed or calculated from percentage)
}

export interface PMConfig {
  rate: number;
  frequency: 'Monthly' | 'Weekly' | 'Yearly';
  lastCalculationDate?: string;
  excludedCategoryIds?: string[];
}

export interface PMCycleAllocation {
  id: string;
  projectId: string;
  cycleId: string;
  cycleLabel: string;
  frequency: 'Monthly' | 'Weekly' | 'Yearly';
  startDate: string;
  endDate: string;
  allocationDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  billId?: string;
  description?: string;
  expenseTotal: number;
  feeRate: number;
  excludedCategoryIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
  installmentConfig?: {
    durationYears: number;
    downPaymentPercentage: number;
    frequency: InstallmentFrequency;
  };
  pmConfig?: PMConfig;
}

export interface Unit {
  id: string;
  name: string;
  projectId: string;
  contactId?: string;
  salePrice?: number;
  description?: string;
  type?: string; // e.g., 2BHK, shop, Office
  area?: number; // Area in square feet
  floor?: string; // e.g., Ground floor, 1st floor
}

export interface Transaction {
  id: string;
  type: TransactionType;
  subtype?: LoanSubtype;
  amount: number;
  date: string;
  description?: string;
  accountId: string;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
  contactId?: string;
  vendorId?: string;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  unitId?: string;
  invoiceId?: string;
  billId?: string;
  contractId?: string;
  agreementId?: string;
  batchId?: string;
  isSystem?: boolean;
  userId?: string;
  payslipId?: string;
  reference?: string;
  children?: Transaction[];
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  contactId: string;
  amount: number;
  paidAmount: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  invoiceType: InvoiceType;
  description?: string;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  unitId?: string;
  categoryId?: string;
  agreementId?: string;
  securityDepositCharge?: number;
  serviceCharges?: number;
  rentalMonth?: string;
}

export type ExpenseBearerType = 'owner' | 'building' | 'tenant';

export interface Bill {
  id: string;
  billNumber: string;
  contactId?: string;
  vendorId?: string;
  amount: number;
  paidAmount: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string;
  description?: string;
  categoryId?: string;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  projectAgreementId?: string;
  contractId?: string;
  staffId?: string;
  expenseBearerType?: ExpenseBearerType; // 'owner' | 'building' | 'tenant' - who bears the expense
  expenseCategoryItems?: ContractExpenseCategoryItem[]; // New: expense category tracking with units and prices
  documentPath?: string; // Path to uploaded document file (legacy/local)
  documentId?: string; // Reference to documents table (local + cloud)
  version?: number; // Version for optimistic locking (default: 1)
}

export interface QuotationItem {
  id: string;
  categoryId: string;
  quantity: number;
  pricePerQuantity: number;
  unit?: string; // e.g., 'sq ft', 'numbers', 'meters', 'liters'
}

export interface Quotation {
  id: string;
  vendorId: string;
  name: string; // Vendor name (redundant but useful for display)
  date: string; // Date of quotation created
  items: QuotationItem[];
  documentId?: string; // Reference to uploaded document
  totalAmount: number; // Calculated from items
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: 'quotation' | 'bill' | 'agreement' | 'contract' | 'id_card' | 'other';
  entityId: string; // ID of the related entity (quotation, bill, etc.)
  entityType: 'quotation' | 'bill' | 'agreement' | 'contract' | 'other';
  fileData: string; // Base64 encoded file data or blob URL
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface RentalAgreement {
  id: string;
  agreementNumber: string;
  contactId: string; // Contact ID (the tenant contact person in rental management, NOT the organization tenant_id for multi-tenancy)
  propertyId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  rentDueDate: number;
  status: RentalAgreementStatus;
  description?: string;
  securityDeposit?: number;
  brokerId?: string;
  brokerFee?: number;
  ownerId?: string; // Optional: stores owner at time of agreement (for historical accuracy after property transfer)
  previousAgreementId?: string; // Links to the previous agreement in a renewal chain
}

export interface ProjectAgreement {
  id: string;
  agreementNumber: string;
  clientId: string;
  projectId: string;
  unitIds: string[];
  listPrice: number;
  customerDiscount: number;
  floorDiscount: number;
  lumpSumDiscount: number;
  miscDiscount: number;
  sellingPrice: number;
  rebateAmount?: number;
  rebateBrokerId?: string;
  issueDate: string;
  description?: string;
  status: ProjectAgreementStatus;
  cancellationDetails?: {
    date: string;
    penaltyAmount: number;
    penaltyPercentage?: number;
    refundAmount: number;
  };
  installmentPlan?: {
    durationYears: number;
    downPaymentPercentage: number;
    frequency: InstallmentFrequency;
  };
  listPriceCategoryId?: string;
  customerDiscountCategoryId?: string;
  floorDiscountCategoryId?: string;
  lumpSumDiscountCategoryId?: string;
  miscDiscountCategoryId?: string;
  sellingPriceCategoryId?: string;
  rebateCategoryId?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalesReturn {
  id: string;
  returnNumber: string;
  agreementId: string;
  returnDate: string;
  reason: SalesReturnReason;
  reasonNotes?: string;
  penaltyPercentage: number;
  penaltyAmount: number;
  refundAmount: number;
  status: SalesReturnStatus;
  processedDate?: string;
  refundedDate?: string;
  refundBillId?: string; // Link to Accounts Payable bill
  createdBy?: string;
  notes?: string;
}

export interface ContractExpenseCategoryItem {
  id: string;
  categoryId: string;
  unit: 'Cubic Feet' | 'Square feet' | 'feet' | 'quantity';
  quantity?: number;
  pricePerUnit: number;
  netValue: number;
}

export interface Contract {
  id: string;
  contractNumber: string;
  name: string;
  projectId: string;
  vendorId: string;
  totalAmount: number;
  area?: number; // Keep for backward compatibility
  rate?: number; // Keep for backward compatibility
  startDate: string;
  endDate: string;
  status: ContractStatus;
  categoryIds: string[]; // Keep for backward compatibility
  expenseCategoryItems?: ContractExpenseCategoryItem[]; // New: expense category tracking with units and prices
  termsAndConditions?: string;
  paymentTerms?: string; // New: payment terms field
  description?: string;
  documentPath?: string; // Path to uploaded document file (legacy/local)
  documentId?: string; // Reference to documents table (local + cloud)
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  projectId?: string; // Optional project ID for project-specific budgets (required for project budgets)
}

export type RecurringFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

export interface RecurringInvoiceTemplate {
  id: string;
  contactId: string;
  propertyId: string;
  buildingId: string;
  amount: number;
  descriptionTemplate: string;
  dayOfMonth: number;
  nextDueDate: string;
  active: boolean;
  agreementId?: string;
  invoiceType?: InvoiceType;
  frequency?: RecurringFrequency;
  autoGenerate?: boolean;
  maxOccurrences?: number;
  generatedCount?: number;
  lastGeneratedDate?: string;
}


export interface AgreementSettings {
  prefix: string;
  nextNumber: number;
  padding: number;
}

export interface InvoiceSettings {
  prefix: string;
  nextNumber: number;
  padding: number;
  /** When true, newly created rental invoices are sent via WhatsApp automatically (default: false) */
  autoSendInvoiceWhatsApp?: boolean;
}

/** Print template configuration from Settings - used by PrintLayout and form templates */
export interface PrintSettings {
  companyName: string;
  companyAddress: string;
  companyContact: string;
  logoUrl?: string;
  showLogo: boolean;
  headerText?: string;
  footerText?: string;
  showDatePrinted: boolean;
  /** Optional: tax ID or registration number shown in header */
  taxId?: string;
  /** Font family for printed documents (print-safe, e.g. Georgia, 'Times New Roman') */
  fontFamily?: string;
  /** Font sizes in px */
  headerFontSize?: number;
  bodyFontSize?: number;
  footerFontSize?: number;
  /** Hex or CSS color for body text */
  textColor?: string;
  /** Table border color */
  tableBorderColor?: string;
  /** Highlight color for headers/totals */
  highlightColor?: string;
  /** Page background color */
  backgroundColor?: string;
  /** Optional watermark text (e.g. 'DRAFT', 'COPY') */
  watermark?: string;
  /** Page size - A4 default */
  pageSize?: 'A4' | 'Letter';
  /** Margins in mm */
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;

  // POS Receipt Settings
  /** Shop name for POS receipts */
  posShopName?: string;
  /** Shop address for POS receipts */
  posShopAddress?: string;
  /** Shop phone number for POS receipts */
  posShopPhone?: string;
  /** Terminal ID for POS receipts */
  posTerminalId?: string;
  /** Show barcode on POS receipts */
  posShowBarcode?: boolean;
  /** Footer text for POS receipts */
  posReceiptFooter?: string;
}

export interface WhatsAppTemplates {
  invoiceReminder: string;
  invoiceReceipt: string;
  billPayment: string;
  billToOwner?: string;
  billToTenant?: string;
  vendorGreeting: string;
  ownerPayoutLedger?: string;
  brokerPayoutLedger?: string;
  payoutConfirmation?: string;
}

export interface DashboardConfig {
  visibleKpis: string[];
}

export interface TransactionLogEntry {
  id: string;
  timestamp: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'CLEAR_ALL';
  entityType: string;
  entityId?: string;
  description: string;
  userId?: string;
  userLabel?: string;
  data?: any;
}

export interface ErrorLogEntry {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
}

export interface ImportLogEntry {
  timestamp: string;
  sheet: string;
  row: number;
  status: 'Success' | 'Error' | 'Skipped' | 'Warning';
  message: string;
  data?: any;
}


export interface AppState {
  version?: number;
  users: User[];
  currentUser: User | null;

  accounts: Account[];
  contacts: Contact[];
  vendors: Vendor[];
  categories: Category[];

  projects: Project[];
  buildings: Building[];
  properties: Property[];
  units: Unit[];

  transactions: Transaction[];
  invoices: Invoice[];
  bills: Bill[];
  quotations: Quotation[];
  documents: Document[];
  budgets: Budget[];

  rentalAgreements: RentalAgreement[];
  projectAgreements: ProjectAgreement[];
  salesReturns: SalesReturn[];
  contracts: Contract[];


  recurringInvoiceTemplates: RecurringInvoiceTemplate[];
  pmCycleAllocations: PMCycleAllocation[];




  agreementSettings: AgreementSettings;
  projectAgreementSettings: AgreementSettings;
  rentalInvoiceSettings: InvoiceSettings;
  projectInvoiceSettings: InvoiceSettings;
  printSettings: PrintSettings;
  whatsAppTemplates: WhatsAppTemplates;
  dashboardConfig: DashboardConfig;
  invoiceHtmlTemplate?: string;
  installmentPlans: InstallmentPlan[]; // Per owner per project installment plans
  planAmenities: PlanAmenity[]; // Configurable amenities that can be added to plans

  showSystemTransactions: boolean;
  enableColorCoding: boolean;
  enableBeepOnSave: boolean;
  enableDatePreservation: boolean; // If enabled, save and reuse the last entered date in forms
  lastPreservedDate?: string; // Last date entered in any form (ISO date string)
  pmCostPercentage: number;
  defaultProjectId?: string; // Default project to use in all forms and reports

  lastServiceChargeRun?: string;

  transactionLog: TransactionLogEntry[];
  errorLog: ErrorLogEntry[];

  currentPage: Page;
  editingEntity: { type: string; id: string } | null;
  initialTransactionType: TransactionType | null;
  initialTransactionFilter: any;
  initialTabs: string[];

  // Bulk Import deep-link support (used by feature pages to open Import page with a preselected type)
  initialImportType?: string | null;
}

export type AppAction =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'SET_PAGE'; payload: Page }
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT'; payload?: any }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'DELETE_USER'; payload: string }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account }
  | { type: 'DELETE_ACCOUNT'; payload: string }
  | { type: 'ADD_CONTACT'; payload: Contact }
  | { type: 'UPDATE_CONTACT'; payload: Contact }
  | { type: 'DELETE_CONTACT'; payload: string }
  | { type: 'ADD_VENDOR'; payload: Vendor }
  | { type: 'UPDATE_VENDOR'; payload: Vendor }
  | { type: 'DELETE_VENDOR'; payload: string }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'ADD_BUILDING'; payload: Building }
  | { type: 'UPDATE_BUILDING'; payload: Building }
  | { type: 'DELETE_BUILDING'; payload: string }
  | { type: 'ADD_PROPERTY'; payload: Property }
  | { type: 'UPDATE_PROPERTY'; payload: Property }
  | { type: 'DELETE_PROPERTY'; payload: string }
  | { type: 'ADD_UNIT'; payload: Unit }
  | { type: 'UPDATE_UNIT'; payload: Unit }
  | { type: 'DELETE_UNIT'; payload: string }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'BATCH_ADD_TRANSACTIONS'; payload: Transaction[] }
  | { type: 'RESTORE_TRANSACTION'; payload: Transaction }
  | { type: 'ADD_INVOICE'; payload: Invoice }
  | { type: 'UPDATE_INVOICE'; payload: Invoice }
  | { type: 'DELETE_INVOICE'; payload: string }
  | { type: 'ADD_BILL'; payload: Bill }
  | { type: 'UPDATE_BILL'; payload: Bill }
  | { type: 'DELETE_BILL'; payload: string }
  | { type: 'ADD_QUOTATION'; payload: Quotation }
  | { type: 'UPDATE_QUOTATION'; payload: Quotation }
  | { type: 'DELETE_QUOTATION'; payload: string }
  | { type: 'ADD_DOCUMENT'; payload: Document }
  | { type: 'UPDATE_DOCUMENT'; payload: Document }
  | { type: 'DELETE_DOCUMENT'; payload: string }
  | { type: 'ADD_BUDGET'; payload: Budget }
  | { type: 'UPDATE_BUDGET'; payload: Budget }
  | { type: 'DELETE_BUDGET'; payload: string }
  | { type: 'ADD_RENTAL_AGREEMENT'; payload: RentalAgreement }
  | { type: 'UPDATE_RENTAL_AGREEMENT'; payload: RentalAgreement }
  | { type: 'DELETE_RENTAL_AGREEMENT'; payload: string }
  | { type: 'ADD_PROJECT_AGREEMENT'; payload: ProjectAgreement }
  | { type: 'UPDATE_PROJECT_AGREEMENT'; payload: ProjectAgreement }
  | { type: 'DELETE_PROJECT_AGREEMENT'; payload: string }
  | { type: 'CANCEL_PROJECT_AGREEMENT'; payload: { agreementId: string; penaltyPercentage: number; penaltyAmount: number; refundAmount: number; refundAccountId?: string; salesReturnId?: string } }
  | { type: 'ADD_SALES_RETURN'; payload: SalesReturn }
  | { type: 'UPDATE_SALES_RETURN'; payload: SalesReturn }
  | { type: 'DELETE_SALES_RETURN'; payload: string }
  | { type: 'PROCESS_SALES_RETURN'; payload: { returnId: string } }
  | { type: 'MARK_RETURN_REFUNDED'; payload: { returnId: string; refundDate: string } }
  | { type: 'ADD_CONTRACT'; payload: Contract }
  | { type: 'UPDATE_CONTRACT'; payload: Contract }
  | { type: 'DELETE_CONTRACT'; payload: string }
  | { type: 'ADD_RECURRING_TEMPLATE'; payload: RecurringInvoiceTemplate }
  | { type: 'UPDATE_RECURRING_TEMPLATE'; payload: RecurringInvoiceTemplate }
  | { type: 'DELETE_RECURRING_TEMPLATE'; payload: string }
  | { type: 'UPDATE_DASHBOARD_CONFIG'; payload: DashboardConfig }
  | { type: 'UPDATE_AGREEMENT_SETTINGS'; payload: AgreementSettings }
  | { type: 'UPDATE_PROJECT_AGREEMENT_SETTINGS'; payload: AgreementSettings }
  | { type: 'UPDATE_RENTAL_INVOICE_SETTINGS'; payload: InvoiceSettings }
  | { type: 'UPDATE_PROJECT_INVOICE_SETTINGS'; payload: InvoiceSettings }
  | { type: 'UPDATE_PRINT_SETTINGS'; payload: PrintSettings }
  | { type: 'UPDATE_WHATSAPP_TEMPLATES'; payload: WhatsAppTemplates }
  | { type: 'UPDATE_INVOICE_TEMPLATE'; payload: string }
  | { type: 'ADD_INSTALLMENT_PLAN'; payload: InstallmentPlan }
  | { type: 'UPDATE_INSTALLMENT_PLAN'; payload: InstallmentPlan }
  | { type: 'DELETE_INSTALLMENT_PLAN'; payload: string }
  | { type: 'ADD_PLAN_AMENITY'; payload: PlanAmenity }
  | { type: 'UPDATE_PLAN_AMENITY'; payload: PlanAmenity }
  | { type: 'DELETE_PLAN_AMENITY'; payload: string }
  | { type: 'UPDATE_PM_COST_PERCENTAGE'; payload: number }
  | { type: 'UPDATE_DEFAULT_PROJECT'; payload: string | undefined }
  | { type: 'UPDATE_DOCUMENT_STORAGE_PATH'; payload: string | undefined }
  | { type: 'SET_LAST_SERVICE_CHARGE_RUN'; payload: string }
  | { type: 'TOGGLE_SYSTEM_TRANSACTIONS'; payload: boolean }
  | { type: 'TOGGLE_COLOR_CODING'; payload: boolean }
  | { type: 'TOGGLE_BEEP_ON_SAVE'; payload: boolean }
  | { type: 'TOGGLE_DATE_PRESERVATION'; payload: boolean }
  | { type: 'UPDATE_PRESERVED_DATE'; payload: string }
  | { type: 'ADD_ERROR_LOG'; payload: any }
  | { type: 'CLEAR_ERROR_LOG' }
  | { type: 'RESET_TRANSACTIONS' }
  | { type: 'LOAD_SAMPLE_DATA' }
  | { type: 'SET_EDITING_ENTITY'; payload: { type: string; id: string } | null }
  | { type: 'CLEAR_EDITING_ENTITY' }
  | { type: 'SET_INITIAL_TRANSACTION_TYPE'; payload: TransactionType | null }
  | { type: 'CLEAR_INITIAL_TRANSACTION_TYPE' }
  | { type: 'SET_INITIAL_TRANSACTION_FILTER'; payload: any }
  | { type: 'SET_INITIAL_IMPORT_TYPE'; payload: string | null }
  | { type: 'CLEAR_INITIAL_IMPORT_TYPE' }
  | { type: 'SET_INITIAL_TABS'; payload: string[] }
  | { type: 'CLEAR_INITIAL_TABS' }
  | { type: 'SET_UPDATE_AVAILABLE'; payload: boolean }
  | { type: 'BATCH_UPSERT_ENTITIES'; payload: Record<string, any[]> }


// ==================== TASK MANAGEMENT TYPES ====================


// ============================================================================
// P2P (PROCUREMENT-TO-PAY) SYSTEM TYPES
// ============================================================================

// PO Status Enum
export enum POStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  INVOICED = 'INVOICED',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED'
}

// Invoice Status Enum
export enum P2PInvoiceStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

// Bill Payment Status Enum
export enum P2PBillPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE'
}

// Supplier Metadata
export interface SupplierMetadata {
  taxId?: string;
  paymentTerms?: 'Net 30' | 'Net 60' | 'Net 90' | 'Due on Receipt' | 'Custom';
  supplierCategory?: string;
  supplierStatus?: 'Active' | 'Inactive';
}

// PO Line Item
export interface POItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  categoryId?: string;
}

// Purchase Order
export interface PurchaseOrder {
  id: string;
  poNumber: string;
  buyerTenantId: string;
  buyerCompanyName?: string;
  buyerName?: string;
  supplierTenantId: string;
  supplierCompanyName?: string;
  supplierName?: string;
  projectId?: string;
  projectName?: string;
  totalAmount: number;
  status: POStatus;
  items: POItem[];
  description?: string;
  targetDeliveryDate?: string;
  createdBy?: string;
  sentAt?: string;
  receivedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  tenantId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  /** Lock: only one party (buyer or supplier) can edit at a time */
  lockedByTenantId?: string;
  lockedByUserId?: string;
  lockedAt?: string;
}

// P2P Invoice
export interface P2PInvoice {
  id: string;
  invoiceNumber: string;
  poId: string;
  buyerTenantId: string;
  supplierTenantId: string;
  amount: number;
  status: P2PInvoiceStatus;
  items: POItem[];
  reviewedBy?: string;
  reviewedAt?: string;
  rejectedReason?: string;
  tenantId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

// P2P Bill
export interface P2PBill {
  id: string;
  billNumber: string;
  invoiceId: string;
  poId: string;
  buyerTenantId: string;
  supplierTenantId: string;
  amount: number;
  dueDate: string;
  paymentStatus: P2PBillPaymentStatus;
  paidAmount: number;
  paidAt?: string;
  paymentAccountId?: string;
  transactionId?: string;
  tenantId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

// Supplier Registration Request Status Enum
export enum SupplierRegistrationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

// Supplier Registration Request
export interface SupplierRegistrationRequest {
  id: string;
  supplierTenantId: string;
  buyerTenantId: string;
  buyerOrganizationEmail: string;
  status: SupplierRegistrationStatus;
  supplierMessage?: string;
  buyerComments?: string;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  tenantId: string;
  // Supplier-provided registration details
  regSupplierName?: string;        // Supplier name (provided during registration)
  regSupplierCompany?: string;     // Supplier company name
  regSupplierContactNo?: string;   // Supplier contact number
  regSupplierAddress?: string;     // Supplier address
  regSupplierDescription?: string; // Description of supplier/services
  // Expanded fields (for UI - from tenant lookup)
  supplierName?: string;
  supplierCompanyName?: string;
  buyerName?: string;
  buyerCompanyName?: string;
  /** True when there is an active row in registered_suppliers; false after unregister */
  isRegistrationActive?: boolean;
}

export interface KpiDefinition {
  id: string;
  title: string;
  group: string;
  icon: ReactNode;
  getData?: (state: AppState) => number;
}

export const LATEST_DATA_VERSION = 5;
