
import { ReactNode } from 'react';

export type Page =
  | 'dashboard'
  | 'transactions'
  | 'payments'
  | 'loans'
  | 'vendorDirectory'
  | 'contacts'
  | 'budgets'
  | 'tasks'
  | 'rentalManagement'
  | 'rentalInvoices'
  | 'rentalAgreements'
  | 'ownerPayouts'
  | 'projectManagement'
  | 'projectInvoices'
  | 'bills'
  | 'payroll'
  | 'settings'
  | 'import';

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
  VENDOR = 'Vendor',
  STAFF = 'Staff',
  BROKER = 'Broker',
  DEALER = 'Dealer',
  FRIEND_FAMILY = 'Friend & Family',
  CLIENT = 'Client',
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

export enum ContractStatus {
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  TERMINATED = 'Terminated',
}

export enum PayslipStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  PAID = 'Paid',
  PARTIALLY_PAID = 'Partially Paid',
  DRAFT = 'Draft'
}

export type UserRole = 'Admin' | 'Manager' | 'Accounts';

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

export interface PMConfig {
    rate: number;
    frequency: 'Monthly' | 'Weekly' | 'Yearly';
    lastCalculationDate?: string;
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
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  unitId?: string;
  invoiceId?: string;
  billId?: string;
  payslipId?: string;
  contractId?: string;
  agreementId?: string;
  batchId?: string;
  isSystem?: boolean;
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

export interface Bill {
  id: string;
  billNumber: string;
  contactId: string;
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
}

export interface RentalAgreement {
  id: string;
  agreementNumber: string;
  tenantId: string;
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
  listPriceCategoryId?: string;
  customerDiscountCategoryId?: string;
  floorDiscountCategoryId?: string;
  lumpSumDiscountCategoryId?: string;
  miscDiscountCategoryId?: string;
  sellingPriceCategoryId?: string;
  rebateCategoryId?: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  name: string;
  projectId: string;
  vendorId: string;
  totalAmount: number;
  area?: number;
  rate?: number;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  categoryIds: string[];
  termsAndConditions?: string;
  description?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
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
  frequency?: RecurringFrequency;
  autoGenerate?: boolean;
  maxOccurrences?: number;
  generatedCount?: number;
  lastGeneratedDate?: string;
}

export type SalaryComponentType = 'Earning' | 'Deduction' | 'Information';
export type CalculationType = 'Fixed' | 'Percentage of Basic';

export interface SalaryComponent {
  id: string;
  name: string;
  type: SalaryComponentType;
  isTaxable: boolean;
  isSystem?: boolean;
}

export interface StaffSalaryComponent {
    componentId: string;
    amount: number;
    calculationType: CalculationType;
    effectiveDate?: string;
}

export interface BankDetails {
    bankName: string;
    accountTitle: string;
    accountNumber: string;
    iban?: string;
}

export interface StaffExitDetails {
    date: string;
    type: 'Resignation' | 'Termination';
    reason: string;
    gratuityAmount?: number;
    benefitsAmount?: number;
    paymentAccountId?: string;
}

export interface LifeCycleEvent {
    date: string;
    type: 'Join' | 'Promotion' | 'Transfer' | 'Exit' | 'Increment' | 'Other';
    description: string;
    prevSalary?: number;
    newSalary?: number;
    prevDesignation?: string;
    newDesignation?: string;
}

export interface Staff {
  id: string;
  employeeId: string;
  designation: string;
  basicSalary: number;
  joiningDate: string;
  status: 'Active' | 'Inactive' | 'Resigned' | 'Terminated';
  email?: string;
  projectId?: string;
  buildingId?: string;
  salaryStructure: StaffSalaryComponent[];
  bankDetails?: BankDetails;
  history: LifeCycleEvent[];
  advanceBalance: number;
  exitDetails?: StaffExitDetails;
}

export interface PayslipItem {
    name: string;
    amount: number;
    isTaxable?: boolean;
    date?: string;
}

export interface Payslip {
  id: string;
  staffId: string;
  month: string;
  issueDate: string;
  basicSalary: number;
  allowances: PayslipItem[];
  totalAllowances: number;
  bonuses?: PayslipItem[];
  totalBonuses?: number;
  deductions: PayslipItem[];
  totalDeductions: number;
  grossSalary: number;
  netSalary: number;
  status: PayslipStatus;
  paidAmount: number;
  paymentDate?: string;
  transactionId?: string;
  projectId?: string;
  buildingId?: string;
  generatedAt: string;
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
}

export interface PrintSettings {
  companyName: string;
  companyAddress: string;
  companyContact: string;
  logoUrl?: string;
  showLogo: boolean;
  headerText?: string;
  footerText?: string;
  showDatePrinted: boolean;
}

export interface WhatsAppTemplates {
  invoiceReminder: string;
  invoiceReceipt: string;
  billPayment: string;
  vendorGreeting: string;
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
    status: 'Success' | 'Error' | 'Skipped';
    message: string;
    data?: any;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
}

export interface AppState {
  version?: number;
  users: User[];
  currentUser: User | null;
  
  accounts: Account[];
  contacts: Contact[];
  categories: Category[];
  
  projects: Project[];
  buildings: Building[];
  properties: Property[];
  units: Unit[];
  
  transactions: Transaction[];
  invoices: Invoice[];
  bills: Bill[];
  budgets: Budget[];
  
  rentalAgreements: RentalAgreement[];
  projectAgreements: ProjectAgreement[];
  contracts: Contract[];
  
  projectStaff: Staff[];
  rentalStaff: Staff[];
  salaryComponents: SalaryComponent[];
  projectPayslips: Payslip[];
  rentalPayslips: Payslip[];
  
  recurringInvoiceTemplates: RecurringInvoiceTemplate[];
  
  agreementSettings: AgreementSettings;
  projectAgreementSettings: AgreementSettings;
  rentalInvoiceSettings: InvoiceSettings;
  projectInvoiceSettings: InvoiceSettings;
  printSettings: PrintSettings;
  whatsAppTemplates: WhatsAppTemplates;
  dashboardConfig: DashboardConfig;
  invoiceHtmlTemplate?: string;
  
  showSystemTransactions: boolean;
  enableColorCoding: boolean;
  enableBeepOnSave: boolean;
  pmCostPercentage: number;
  
  lastServiceChargeRun?: string;
  
  transactionLog: TransactionLogEntry[];
  errorLog: ErrorLogEntry[];

  currentPage: Page;
  editingEntity: { type: string; id: string } | null;
  initialTransactionType: TransactionType | null;
  initialTransactionFilter: any;
  initialTabs: string[];
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
  | { type: 'ADD_BUDGET'; payload: Budget }
  | { type: 'UPDATE_BUDGET'; payload: Budget }
  | { type: 'DELETE_BUDGET'; payload: string }
  | { type: 'ADD_RENTAL_AGREEMENT'; payload: RentalAgreement }
  | { type: 'UPDATE_RENTAL_AGREEMENT'; payload: RentalAgreement }
  | { type: 'DELETE_RENTAL_AGREEMENT'; payload: string }
  | { type: 'ADD_PROJECT_AGREEMENT'; payload: ProjectAgreement }
  | { type: 'UPDATE_PROJECT_AGREEMENT'; payload: ProjectAgreement }
  | { type: 'DELETE_PROJECT_AGREEMENT'; payload: string }
  | { type: 'CANCEL_PROJECT_AGREEMENT'; payload: { agreementId: string; penaltyPercentage: number; penaltyAmount: number; refundAmount: number; refundAccountId?: string } }
  | { type: 'ADD_CONTRACT'; payload: Contract }
  | { type: 'UPDATE_CONTRACT'; payload: Contract }
  | { type: 'DELETE_CONTRACT'; payload: string }
  | { type: 'ADD_RECURRING_TEMPLATE'; payload: RecurringInvoiceTemplate }
  | { type: 'UPDATE_RECURRING_TEMPLATE'; payload: RecurringInvoiceTemplate }
  | { type: 'DELETE_RECURRING_TEMPLATE'; payload: string }
  | { type: 'ADD_SALARY_COMPONENT'; payload: SalaryComponent }
  | { type: 'UPDATE_SALARY_COMPONENT'; payload: SalaryComponent }
  | { type: 'DELETE_SALARY_COMPONENT'; payload: string }
  | { type: 'ADD_PROJECT_STAFF'; payload: Staff }
  | { type: 'UPDATE_PROJECT_STAFF'; payload: Staff }
  | { type: 'DELETE_PROJECT_STAFF'; payload: string }
  | { type: 'ADD_RENTAL_STAFF'; payload: Staff }
  | { type: 'UPDATE_RENTAL_STAFF'; payload: Staff }
  | { type: 'DELETE_RENTAL_STAFF'; payload: string }
  | { type: 'PROMOTE_STAFF'; payload: { staffId: string; newDesignation: string; newSalary: number; effectiveDate: string; type: string } }
  | { type: 'TRANSFER_STAFF'; payload: { staffId: string; newProjectId?: string; newBuildingId?: string; effectiveDate: string } }
  | { type: 'STAFF_EXIT'; payload: { staffId: string; type: 'Resignation' | 'Termination'; date: string; reason: string; gratuityAmount: number; benefitsAmount: number; paymentAccountId?: string } }
  | { type: 'GENERATE_PAYROLL'; payload: { month: string; issueDate: string; type: 'All' | 'Project' | 'Rental' } }
  | { type: 'GENERATE_PROJECT_PAYROLL'; payload: { month: string; issueDate: string } }
  | { type: 'GENERATE_RENTAL_PAYROLL'; payload: { month: string; issueDate: string } }
  | { type: 'UPDATE_PAYSLIP'; payload: Payslip }
  | { type: 'MARK_PROJECT_PAYSLIP_PAID'; payload: { payslipId: string; accountId: string; paymentDate: string; amount: number; projectId?: string; description?: string } }
  | { type: 'MARK_RENTAL_PAYSLIP_PAID'; payload: { payslipId: string; accountId: string; paymentDate: string; amount: number; description?: string } }
  | { type: 'DELETE_PROJECT_PAYSLIP'; payload: string }
  | { type: 'DELETE_RENTAL_PAYSLIP'; payload: string }
  | { type: 'UPDATE_DASHBOARD_CONFIG'; payload: DashboardConfig }
  | { type: 'UPDATE_AGREEMENT_SETTINGS'; payload: AgreementSettings }
  | { type: 'UPDATE_PROJECT_AGREEMENT_SETTINGS'; payload: AgreementSettings }
  | { type: 'UPDATE_RENTAL_INVOICE_SETTINGS'; payload: InvoiceSettings }
  | { type: 'UPDATE_PROJECT_INVOICE_SETTINGS'; payload: InvoiceSettings }
  | { type: 'UPDATE_PRINT_SETTINGS'; payload: PrintSettings }
  | { type: 'UPDATE_WHATSAPP_TEMPLATES'; payload: WhatsAppTemplates }
  | { type: 'UPDATE_INVOICE_TEMPLATE'; payload: string }
  | { type: 'UPDATE_PM_COST_PERCENTAGE'; payload: number }
  | { type: 'SET_LAST_SERVICE_CHARGE_RUN'; payload: string }
  | { type: 'TOGGLE_SYSTEM_TRANSACTIONS'; payload: boolean }
  | { type: 'TOGGLE_COLOR_CODING'; payload: boolean }
  | { type: 'TOGGLE_BEEP_ON_SAVE'; payload: boolean }
  | { type: 'ADD_ERROR_LOG'; payload: any }
  | { type: 'CLEAR_ERROR_LOG' }
  | { type: 'RESET_TRANSACTIONS' }
  | { type: 'LOAD_SAMPLE_DATA' }
  | { type: 'SET_EDITING_ENTITY'; payload: { type: string; id: string } | null }
  | { type: 'CLEAR_EDITING_ENTITY' }
  | { type: 'SET_INITIAL_TRANSACTION_TYPE'; payload: TransactionType | null }
  | { type: 'CLEAR_INITIAL_TRANSACTION_TYPE' }
  | { type: 'SET_INITIAL_TRANSACTION_FILTER'; payload: any }
  | { type: 'SET_INITIAL_TABS'; payload: string[] }
  | { type: 'CLEAR_INITIAL_TABS' }
  | { type: 'SET_UPDATE_AVAILABLE'; payload: boolean };

export interface KpiDefinition {
  id: string;
  title: string;
  group: string;
  icon: ReactNode;
  getData?: (state: AppState) => number;
}

export const LATEST_DATA_VERSION = 4;
