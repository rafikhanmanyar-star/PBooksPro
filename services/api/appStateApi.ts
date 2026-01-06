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

      // Return partial state with API-loaded data
      // Other entities will remain from initial state or be loaded separately
      return {
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
        contracts,
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
    return this.transactionsRepo.create(transactionWithId);
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
    return this.billsRepo.create(billWithId);
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
    return this.contractsRepo.create(contractWithId);
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

