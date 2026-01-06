/**
 * App State API Service
 * 
 * Loads application state from the API instead of local database.
 * This is used when the app is in cloud mode (authenticated with tenant).
 */

import { AppState } from '../../types';
import { AccountsApiRepository } from './repositories/accountsApi';
import { ContactsApiRepository } from './repositories/contactsApi';
import { TransactionsApiRepository } from './repositories/transactionsApi';
import { CategoriesApiRepository } from './repositories/categoriesApi';
import { ProjectsApiRepository } from './repositories/projectsApi';
import { BuildingsApiRepository } from './repositories/buildingsApi';
import { PropertiesApiRepository } from './repositories/propertiesApi';
import { UnitsApiRepository } from './repositories/unitsApi';
import { InvoicesApiRepository } from './repositories/invoicesApi';
import { BillsApiRepository } from './repositories/billsApi';
import { BudgetsApiRepository } from './repositories/budgetsApi';
import { RentalAgreementsApiRepository } from './repositories/rentalAgreementsApi';
import { ProjectAgreementsApiRepository } from './repositories/projectAgreementsApi';
import { ContractsApiRepository } from './repositories/contractsApi';
import { logger } from '../logger';

export class AppStateApiService {
  private accountsRepo: AccountsApiRepository;
  private contactsRepo: ContactsApiRepository;
  private transactionsRepo: TransactionsApiRepository;
  private categoriesRepo: CategoriesApiRepository;
  private projectsRepo: ProjectsApiRepository;
  private buildingsRepo: BuildingsApiRepository;
  private propertiesRepo: PropertiesApiRepository;
  private unitsRepo: UnitsApiRepository;
  private invoicesRepo: InvoicesApiRepository;
  private billsRepo: BillsApiRepository;
  private budgetsRepo: BudgetsApiRepository;
  private rentalAgreementsRepo: RentalAgreementsApiRepository;
  private projectAgreementsRepo: ProjectAgreementsApiRepository;
  private contractsRepo: ContractsApiRepository;

  constructor() {
    this.accountsRepo = new AccountsApiRepository();
    this.contactsRepo = new ContactsApiRepository();
    this.transactionsRepo = new TransactionsApiRepository();
    this.categoriesRepo = new CategoriesApiRepository();
    this.projectsRepo = new ProjectsApiRepository();
    this.buildingsRepo = new BuildingsApiRepository();
    this.propertiesRepo = new PropertiesApiRepository();
    this.unitsRepo = new UnitsApiRepository();
    this.invoicesRepo = new InvoicesApiRepository();
    this.billsRepo = new BillsApiRepository();
    this.budgetsRepo = new BudgetsApiRepository();
    this.rentalAgreementsRepo = new RentalAgreementsApiRepository();
    this.projectAgreementsRepo = new ProjectAgreementsApiRepository();
    this.contractsRepo = new ContractsApiRepository();
  }

  /**
   * Load complete application state from API
   * Loads all entities that have API endpoints
   */
  async loadState(): Promise<Partial<AppState>> {
    try {
      logger.logCategory('sync', '📡 Loading state from API...');

      // Load entities in parallel for better performance
      const [
        accounts,
        contacts,
        transactions,
        categories,
        projects,
        buildings,
        properties,
        units,
        invoices,
        bills,
        budgets,
        rentalAgreements,
        projectAgreements,
        contracts
      ] = await Promise.all([
        this.accountsRepo.findAll().catch(err => {
          logger.errorCategory('sync', 'Error loading accounts from API:', err);
          return [];
        }),
        this.contactsRepo.findAll().catch(err => {
          console.error('Error loading contacts from API:', err);
          return [];
        }),
        this.transactionsRepo.findAll().catch(err => {
          console.error('Error loading transactions from API:', err);
          return [];
        }),
        this.categoriesRepo.findAll().catch(err => {
          console.error('Error loading categories from API:', err);
          return [];
        }),
        this.projectsRepo.findAll().catch(err => {
          console.error('Error loading projects from API:', err);
          return [];
        }),
        this.buildingsRepo.findAll().catch(err => {
          console.error('Error loading buildings from API:', err);
          return [];
        }),
        this.propertiesRepo.findAll().catch(err => {
          console.error('Error loading properties from API:', err);
          return [];
        }),
        this.unitsRepo.findAll().catch(err => {
          console.error('Error loading units from API:', err);
          return [];
        }),
        this.invoicesRepo.findAll().catch(err => {
          console.error('Error loading invoices from API:', err);
          return [];
        }),
        this.billsRepo.findAll().catch(err => {
          console.error('Error loading bills from API:', err);
          return [];
        }),
        this.budgetsRepo.findAll().catch(err => {
          console.error('Error loading budgets from API:', err);
          return [];
        }),
        this.rentalAgreementsRepo.findAll().catch(err => {
          console.error('Error loading rental agreements from API:', err);
          return [];
        }),
        this.projectAgreementsRepo.findAll().catch(err => {
          console.error('Error loading project agreements from API:', err);
          return [];
        }),
        this.contractsRepo.findAll().catch(err => {
          console.error('Error loading contracts from API:', err);
          return [];
        }),
      ]);

      logger.logCategory('sync', '✅ Loaded from API:', {
        accounts: accounts.length,
        contacts: contacts.length,
        transactions: transactions.length,
        categories: categories.length,
        projects: projects.length,
        buildings: buildings.length,
        properties: properties.length,
        units: units.length,
        invoices: invoices.length,
        bills: bills.length,
        budgets: budgets.length,
        rentalAgreements: rentalAgreements.length,
        projectAgreements: projectAgreements.length,
        contracts: contracts.length,
      });

      // Normalize units from API (transform snake_case to camelCase)
      // The server returns snake_case fields, but the client expects camelCase
      const normalizedUnits = units.map((u: any) => ({
        id: u.id,
        name: u.name || '',
        projectId: u.project_id || u.projectId || '',
        contactId: u.contact_id || u.contactId || undefined,
        salePrice: (() => {
          const price = u.sale_price || u.salePrice;
          if (price == null) return undefined;
          return typeof price === 'number' ? price : parseFloat(String(price));
        })(),
        description: u.description || undefined
      }));

      // Normalize bills from API (transform snake_case to camelCase)
      // The server returns snake_case fields, but the client expects camelCase
      const normalizedBills = bills.map((b: any) => ({
        id: b.id,
        billNumber: b.bill_number || b.billNumber,
        contactId: b.contact_id || b.contactId,
        amount: typeof b.amount === 'number' ? b.amount : parseFloat(b.amount || '0'),
        paidAmount: typeof b.paid_amount === 'number' ? b.paid_amount : (typeof b.paidAmount === 'number' ? b.paidAmount : parseFloat(b.paid_amount || b.paidAmount || '0')),
        status: b.status || 'Unpaid',
        issueDate: b.issue_date || b.issueDate,
        dueDate: b.due_date || b.dueDate || undefined,
        description: b.description || undefined,
        categoryId: b.category_id || b.categoryId || undefined,
        projectId: b.project_id || b.projectId || undefined,
        buildingId: b.building_id || b.buildingId || undefined,
        propertyId: b.property_id || b.propertyId || undefined,
        projectAgreementId: b.project_agreement_id || b.projectAgreementId || undefined,
        contractId: b.contract_id || b.contractId || undefined,
        staffId: b.staff_id || b.staffId || undefined,
        documentPath: b.document_path || b.documentPath || undefined,
        expenseCategoryItems: (() => {
          const items = b.expense_category_items || b.expenseCategoryItems;
          if (!items) return undefined;
          if (typeof items === 'string' && items.trim().length > 0) {
            try {
              return JSON.parse(items);
            } catch {
              return undefined;
            }
          }
          if (Array.isArray(items)) return items;
          return undefined;
        })()
      }));

      // Normalize contracts from API (transform snake_case to camelCase)
      // The server returns snake_case fields, but the client expects camelCase
      const normalizedContracts = contracts.map((c: any) => ({
        id: c.id,
        contractNumber: c.contract_number || c.contractNumber,
        name: c.name || '',
        projectId: c.project_id || c.projectId || '',
        vendorId: c.vendor_id || c.vendorId || '',
        totalAmount: typeof c.total_amount === 'number' ? c.total_amount : (typeof c.totalAmount === 'number' ? c.totalAmount : parseFloat(c.total_amount || c.totalAmount || '0')),
        area: c.area !== undefined && c.area !== null 
          ? (typeof c.area === 'number' ? c.area : parseFloat(c.area || '0'))
          : undefined,
        rate: c.rate !== undefined && c.rate !== null
          ? (typeof c.rate === 'number' ? c.rate : parseFloat(c.rate || '0'))
          : undefined,
        startDate: c.start_date || c.startDate,
        endDate: c.end_date || c.endDate,
        status: c.status || 'Active',
        categoryIds: (() => {
          const ids = c.category_ids || c.categoryIds;
          if (!ids) return [];
          if (typeof ids === 'string' && ids.trim().length > 0) {
            try {
              return JSON.parse(ids);
            } catch {
              return [];
            }
          }
          if (Array.isArray(ids)) return ids;
          return [];
        })(),
        expenseCategoryItems: (() => {
          const items = c.expense_category_items || c.expenseCategoryItems;
          if (!items) return undefined;
          if (typeof items === 'string' && items.trim().length > 0) {
            try {
              return JSON.parse(items);
            } catch {
              return undefined;
            }
          }
          if (Array.isArray(items)) return items;
          return undefined;
        })(),
        termsAndConditions: c.terms_and_conditions || c.termsAndConditions || undefined,
        paymentTerms: c.payment_terms || c.paymentTerms || undefined,
        description: c.description || undefined,
        documentPath: c.document_path || c.documentPath || undefined
      }));

      // Normalize transactions from API (transform snake_case to camelCase)
      // The server returns snake_case fields, but the client expects camelCase
      const normalizedTransactions = transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        subtype: t.subtype || undefined,
        amount: typeof t.amount === 'number' ? t.amount : parseFloat(t.amount || '0'),
        date: t.date,
        description: t.description || undefined,
        accountId: t.account_id || t.accountId,
        fromAccountId: t.from_account_id || t.fromAccountId || undefined,
        toAccountId: t.to_account_id || t.toAccountId || undefined,
        categoryId: t.category_id || t.categoryId || undefined,
        contactId: t.contact_id || t.contactId || undefined,
        projectId: t.project_id || t.projectId || undefined,
        buildingId: t.building_id || t.buildingId || undefined,
        propertyId: t.property_id || t.propertyId || undefined,
        unitId: t.unit_id || t.unitId || undefined,
        invoiceId: t.invoice_id || t.invoiceId || undefined,
        billId: t.bill_id || t.billId || undefined,
        payslipId: t.payslip_id || t.payslipId || undefined,
        contractId: t.contract_id || t.contractId || undefined,
        agreementId: t.agreement_id || t.agreementId || undefined,
        batchId: t.batch_id || t.batchId || undefined,
        isSystem: t.is_system === true || t.is_system === 1 || t.isSystem === true || false,
        userId: t.user_id || t.userId || undefined,
        children: t.children || undefined
      }));

      // Return partial state with API-loaded data
      // Other entities will remain from initial state or be loaded separately
      return {
        accounts,
        contacts,
        transactions: normalizedTransactions,
        categories,
        projects,
        buildings,
        properties,
        units: normalizedUnits,
        invoices,
        bills: normalizedBills,
        budgets,
        rentalAgreements,
        projectAgreements,
        contracts: normalizedContracts,
      };
    } catch (error) {
      logger.errorCategory('sync', '❌ Error loading state from API:', error);
      throw error;
    }
  }

  /**
   * Load contacts only (useful for targeted sync tests)
   */
  async loadContacts() {
    return this.contactsRepo.findAll();
  }

  /**
   * Load transactions only (targeted sync)
   */
  async loadTransactions() {
    return this.transactionsRepo.findAll();
  }

  /**
   * Save account to API
   */
  async saveAccount(account: Partial<AppState['accounts'][0]>): Promise<AppState['accounts'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const accountWithId = {
      ...account,
      id: account.id || `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing account (POST upsert): ${accountWithId.id} - ${accountWithId.name}`);
    return this.accountsRepo.create(accountWithId);
  }

  /**
   * Delete account from API
   */
  async deleteAccount(id: string): Promise<void> {
    return this.accountsRepo.delete(id);
  }

  /**
   * Save contact to API
   */
  async saveContact(contact: Partial<AppState['contacts'][0]>): Promise<AppState['contacts'][0]> {
    logger.logCategory('sync', '💾 AppStateApiService.saveContact called:', {
      id: contact.id,
      name: contact.name,
      type: contact.type,
      isUpdate: !!contact.id
    });
    
    // Validate required fields
    if (!contact.name) {
      const error = new Error('Contact name is required');
      logger.errorCategory('sync', '❌ AppStateApiService.saveContact validation failed: name missing');
      throw error;
    }
    if (!contact.type) {
      const error = new Error('Contact type is required');
      logger.errorCategory('sync', '❌ AppStateApiService.saveContact validation failed: type missing');
      throw error;
    }
    
    try {
      // Ensure contact has an ID
      const contactWithId = {
        ...contact,
        id: contact.id || `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Always use POST endpoint for contacts - it handles upserts automatically
      // The server-side POST endpoint checks if contact exists and updates it, or creates it if new
      // This avoids the "Contact not found" error when syncing new contacts that have IDs but don't exist in DB yet
      logger.logCategory('sync', `💾 Syncing contact (POST upsert): ${contactWithId.id} - ${contactWithId.name}`);
      const result = await this.contactsRepo.create(contactWithId);
      
      // Log whether it was created or updated based on whether we had an existing ID
      if (contact.id) {
        logger.logCategory('sync', `✅ Contact synced (upsert) successfully: ${result.name} (${result.id})`);
      } else {
        logger.logCategory('sync', `✅ Contact created successfully: ${result.name} (${result.id})`);
      }
      
      return result;
    } catch (error: any) {
      logger.errorCategory('sync', '❌ AppStateApiService.saveContact failed:', {
        error: error,
        errorMessage: error?.message || error?.error || 'Unknown error',
        status: error?.status,
        contact: {
          id: contact.id,
          name: contact.name,
          type: contact.type
        }
      });
      throw error;
    }
  }

  /**
   * Delete contact from API
   */
  async deleteContact(id: string): Promise<void> {
    return this.contactsRepo.delete(id);
  }

  /**
   * Save transaction to API
   */
  async saveTransaction(transaction: Partial<AppState['transactions'][0]>): Promise<AppState['transactions'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const transactionWithId = {
      ...transaction,
      id: transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing transaction (POST upsert): ${transactionWithId.id}`);
    const saved = await this.transactionsRepo.create(transactionWithId);
    
    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      type: saved.type,
      subtype: (saved as any).subtype || saved.subtype || undefined,
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(saved.amount || '0'),
      date: saved.date,
      description: saved.description || undefined,
      accountId: (saved as any).account_id || saved.accountId,
      fromAccountId: (saved as any).from_account_id || saved.fromAccountId || undefined,
      toAccountId: (saved as any).to_account_id || saved.toAccountId || undefined,
      categoryId: (saved as any).category_id || saved.categoryId || undefined,
      contactId: (saved as any).contact_id || saved.contactId || undefined,
      projectId: (saved as any).project_id || saved.projectId || undefined,
      buildingId: (saved as any).building_id || saved.buildingId || undefined,
      propertyId: (saved as any).property_id || saved.propertyId || undefined,
      unitId: (saved as any).unit_id || saved.unitId || undefined,
      invoiceId: (saved as any).invoice_id || saved.invoiceId || undefined,
      billId: (saved as any).bill_id || saved.billId || undefined,
      payslipId: (saved as any).payslip_id || saved.payslipId || undefined,
      contractId: (saved as any).contract_id || saved.contractId || undefined,
      agreementId: (saved as any).agreement_id || saved.agreementId || undefined,
      batchId: (saved as any).batch_id || saved.batchId || undefined,
      isSystem: (saved as any).is_system === true || (saved as any).is_system === 1 || saved.isSystem === true || false,
      children: saved.children || undefined
    };
  }

  /**
   * Delete transaction from API
   */
  async deleteTransaction(id: string): Promise<void> {
    return this.transactionsRepo.delete(id);
  }

  /**
   * Save category to API
   */
  async saveCategory(category: Partial<AppState['categories'][0]>): Promise<AppState['categories'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const categoryWithId = {
      ...category,
      id: category.id || `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing category (POST upsert): ${categoryWithId.id} - ${categoryWithId.name}`);
    return this.categoriesRepo.create(categoryWithId);
  }

  /**
   * Delete category from API
   */
  async deleteCategory(id: string): Promise<void> {
    return this.categoriesRepo.delete(id);
  }

  /**
   * Save project to API
   */
  async saveProject(project: Partial<AppState['projects'][0]>): Promise<AppState['projects'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const projectWithId = {
      ...project,
      id: project.id || `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing project (POST upsert): ${projectWithId.id} - ${projectWithId.name}`);
    return this.projectsRepo.create(projectWithId);
  }

  /**
   * Delete project from API
   */
  async deleteProject(id: string): Promise<void> {
    return this.projectsRepo.delete(id);
  }

  /**
   * Save building to API
   */
  async saveBuilding(building: Partial<AppState['buildings'][0]>): Promise<AppState['buildings'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const buildingWithId = {
      ...building,
      id: building.id || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing building (POST upsert): ${buildingWithId.id} - ${buildingWithId.name}`);
    return this.buildingsRepo.create(buildingWithId);
  }

  /**
   * Delete building from API
   */
  async deleteBuilding(id: string): Promise<void> {
    return this.buildingsRepo.delete(id);
  }

  /**
   * Save property to API
   */
  async saveProperty(property: Partial<AppState['properties'][0]>): Promise<AppState['properties'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const propertyWithId = {
      ...property,
      id: property.id || `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing property (POST upsert): ${propertyWithId.id} - ${propertyWithId.name}`);
    return this.propertiesRepo.create(propertyWithId);
  }

  /**
   * Delete property from API
   */
  async deleteProperty(id: string): Promise<void> {
    return this.propertiesRepo.delete(id);
  }

  /**
   * Save unit to API
   */
  async saveUnit(unit: Partial<AppState['units'][0]>): Promise<AppState['units'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const unitWithId = {
      ...unit,
      id: unit.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing unit (POST upsert): ${unitWithId.id} - ${unitWithId.name}`);
    return this.unitsRepo.create(unitWithId);
  }

  /**
   * Delete unit from API
   */
  async deleteUnit(id: string): Promise<void> {
    return this.unitsRepo.delete(id);
  }

  /**
   * Save invoice to API
   */
  async saveInvoice(invoice: Partial<AppState['invoices'][0]>): Promise<AppState['invoices'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const invoiceWithId = {
      ...invoice,
      id: invoice.id || `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing invoice (POST upsert): ${invoiceWithId.id} - ${invoiceWithId.invoiceNumber}`);
    return this.invoicesRepo.create(invoiceWithId);
  }

  /**
   * Delete invoice from API
   */
  async deleteInvoice(id: string): Promise<void> {
    return this.invoicesRepo.delete(id);
  }

  /**
   * Save bill to API
   */
  async saveBill(bill: Partial<AppState['bills'][0]>): Promise<AppState['bills'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const billWithId = {
      ...bill,
      id: bill.id || `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing bill (POST upsert): ${billWithId.id} - ${billWithId.billNumber}`);
    const saved = await this.billsRepo.create(billWithId);
    
    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      billNumber: (saved as any).bill_number || saved.billNumber,
      contactId: (saved as any).contact_id || saved.contactId,
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(saved.amount || '0'),
      paidAmount: typeof (saved as any).paid_amount === 'number' ? (saved as any).paid_amount : (typeof saved.paidAmount === 'number' ? saved.paidAmount : parseFloat((saved as any).paid_amount || saved.paidAmount || '0')),
      status: saved.status || 'Unpaid',
      issueDate: (saved as any).issue_date || saved.issueDate,
      dueDate: (saved as any).due_date || saved.dueDate || undefined,
      description: saved.description || undefined,
      categoryId: (saved as any).category_id || saved.categoryId || undefined,
      projectId: (saved as any).project_id || saved.projectId || undefined,
      buildingId: (saved as any).building_id || saved.buildingId || undefined,
      propertyId: (saved as any).property_id || saved.propertyId || undefined,
      projectAgreementId: (saved as any).project_agreement_id || saved.projectAgreementId || undefined,
      contractId: (saved as any).contract_id || saved.contractId || undefined,
      staffId: (saved as any).staff_id || saved.staffId || undefined,
      documentPath: (saved as any).document_path || saved.documentPath || undefined,
      expenseCategoryItems: (() => {
        const items = (saved as any).expense_category_items || saved.expenseCategoryItems;
        if (!items) return undefined;
        if (typeof items === 'string' && items.trim().length > 0) {
          try {
            return JSON.parse(items);
          } catch {
            return undefined;
          }
        }
        if (Array.isArray(items)) return items;
        return undefined;
      })()
    };
  }

  /**
   * Delete bill from API
   */
  async deleteBill(id: string): Promise<void> {
    return this.billsRepo.delete(id);
  }

  /**
   * Save budget to API
   */
  async saveBudget(budget: Partial<AppState['budgets'][0]>): Promise<AppState['budgets'][0]> {
    if (budget.id) {
      return this.budgetsRepo.update(budget.id, budget);
    } else {
      return this.budgetsRepo.create(budget);
    }
  }

  /**
   * Delete budget from API
   */
  async deleteBudget(id: string): Promise<void> {
    return this.budgetsRepo.delete(id);
  }

  /**
   * Save rental agreement to API
   */
  async saveRentalAgreement(agreement: Partial<AppState['rentalAgreements'][0]>): Promise<AppState['rentalAgreements'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const agreementWithId = {
      ...agreement,
      id: agreement.id || `rental_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing rental agreement (POST upsert): ${agreementWithId.id} - ${agreementWithId.agreementNumber}`);
    return this.rentalAgreementsRepo.create(agreementWithId);
  }

  /**
   * Delete rental agreement from API
   */
  async deleteRentalAgreement(id: string): Promise<void> {
    return this.rentalAgreementsRepo.delete(id);
  }

  /**
   * Save project agreement to API
   */
  async saveProjectAgreement(agreement: Partial<AppState['projectAgreements'][0]>): Promise<AppState['projectAgreements'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const agreementWithId = {
      ...agreement,
      id: agreement.id || `project_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing project agreement (POST upsert): ${agreementWithId.id} - ${agreementWithId.agreementNumber}`);
    return this.projectAgreementsRepo.create(agreementWithId);
  }

  /**
   * Delete project agreement from API
   */
  async deleteProjectAgreement(id: string): Promise<void> {
    return this.projectAgreementsRepo.delete(id);
  }

  /**
   * Save contract to API
   */
  async saveContract(contract: Partial<AppState['contracts'][0]>): Promise<AppState['contracts'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const contractWithId = {
      ...contract,
      id: contract.id || `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing contract (POST upsert): ${contractWithId.id} - ${contractWithId.contractNumber}`);
    const saved = await this.contractsRepo.create(contractWithId);
    
    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      contractNumber: (saved as any).contract_number || saved.contractNumber,
      name: saved.name || '',
      projectId: (saved as any).project_id || saved.projectId || '',
      vendorId: (saved as any).vendor_id || saved.vendorId || '',
      totalAmount: typeof saved.totalAmount === 'number' ? saved.totalAmount : parseFloat((saved as any).total_amount || saved.totalAmount || '0'),
      area: (saved as any).area !== undefined && (saved as any).area !== null 
        ? (typeof (saved as any).area === 'number' ? (saved as any).area : parseFloat((saved as any).area || '0'))
        : (saved.area !== undefined && saved.area !== null 
          ? (typeof saved.area === 'number' ? saved.area : parseFloat(saved.area || '0'))
          : undefined),
      rate: (saved as any).rate !== undefined && (saved as any).rate !== null
        ? (typeof (saved as any).rate === 'number' ? (saved as any).rate : parseFloat((saved as any).rate || '0'))
        : (saved.rate !== undefined && saved.rate !== null
          ? (typeof saved.rate === 'number' ? saved.rate : parseFloat(saved.rate || '0'))
          : undefined),
      startDate: (saved as any).start_date || saved.startDate,
      endDate: (saved as any).end_date || saved.endDate,
      status: saved.status || 'Active',
      categoryIds: (() => {
        const ids = (saved as any).category_ids || saved.categoryIds;
        if (!ids) return [];
        if (typeof ids === 'string' && ids.trim().length > 0) {
          try {
            return JSON.parse(ids);
          } catch {
            return [];
          }
        }
        if (Array.isArray(ids)) return ids;
        return [];
      })(),
      expenseCategoryItems: (() => {
        const items = (saved as any).expense_category_items || saved.expenseCategoryItems;
        if (!items) return undefined;
        if (typeof items === 'string' && items.trim().length > 0) {
          try {
            return JSON.parse(items);
          } catch {
            return undefined;
          }
        }
        if (Array.isArray(items)) return items;
        return undefined;
      })(),
      termsAndConditions: (saved as any).terms_and_conditions || saved.termsAndConditions || undefined,
      paymentTerms: (saved as any).payment_terms || saved.paymentTerms || undefined,
      description: saved.description || undefined,
      documentPath: (saved as any).document_path || saved.documentPath || undefined
    };
  }

  /**
   * Delete contract from API
   */
  async deleteContract(id: string): Promise<void> {
    return this.contractsRepo.delete(id);
  }
}

// Singleton instance
let appStateApiInstance: AppStateApiService | null = null;

export function getAppStateApiService(): AppStateApiService {
  if (!appStateApiInstance) {
    appStateApiInstance = new AppStateApiService();
  }
  return appStateApiInstance;
}

