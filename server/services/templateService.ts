import * as XLSX from 'xlsx';
import { getDatabaseService } from './databaseService.js';

export interface TemplateOptions {
  includeSampleData?: boolean;
  tenantId: string;
  sheetName?: string; // If provided, generate only this sheet
}

// Define import order
export const IMPORT_ORDER = [
  { name: 'Accounts', dependencies: [], description: 'Import accounts first' },
  { name: 'Contacts', dependencies: [], description: 'Import contacts (required for Properties, Units, and Rental Agreements)' },
  { name: 'Categories', dependencies: [], description: 'Import categories' },
  { name: 'Projects', dependencies: [], description: 'Import projects (required for Units)' },
  { name: 'Buildings', dependencies: [], description: 'Import buildings (required for Properties)' },
  { name: 'Units', dependencies: ['Projects', 'Contacts'], description: 'Import units (depends on Projects and Contacts)' },
  { name: 'Properties', dependencies: ['Contacts', 'Buildings'], description: 'Import properties (depends on Contacts and Buildings)' },
  { name: 'RentalAgreements', dependencies: ['Properties', 'Contacts'], description: 'Import rental agreements (depends on Properties and Contacts)' },
  { name: 'ProjectSellingAgreements', dependencies: ['Projects', 'Units', 'Contacts'], description: 'Import project selling agreements / installment plans (depends on Projects, Units, and Contacts)' },
  { name: 'RentalInvoices', dependencies: ['RentalAgreements', 'Contacts', 'Properties'], description: 'Import rental invoices (depends on Rental Agreements, Contacts, and Properties)' },
  { name: 'LoanTransactions', dependencies: ['Accounts'], description: 'Import loan transactions (Give/Receive/Repay/Collect); bank account required (Bank-type account name)' }
];

/**
 * Generate Excel template - either single sheet or all sheets
 * Each sheet contains headers and optionally sample data
 */
export async function generateTemplate(options: TemplateOptions): Promise<Buffer> {
  try {
    const workbook = XLSX.utils.book_new();
    const db = getDatabaseService();

    // Define sheet structures
    const allSheets = [
      {
        name: 'Contacts',
        headers: ['name', 'type', 'description', 'contact_no', 'company_name', 'address'],
        required: ['name', 'type'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const contacts = await db.query(
            'SELECT name, type, description, contact_no, company_name, address FROM contacts WHERE tenant_id = $1 LIMIT 1',
            [options.tenantId]
          );
          return contacts.length > 0 ? [contacts[0]] : [];
        }
      },
      {
        name: 'Projects',
        headers: ['name', 'description', 'color', 'status'],
        required: ['name'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const projects = await db.query(
            'SELECT name, description, color, status FROM projects WHERE tenant_id = $1 LIMIT 1',
            [options.tenantId]
          );
          return projects.length > 0 ? [projects[0]] : [];
        }
      },
      {
        name: 'Buildings',
        headers: ['name', 'description', 'color'],
        required: ['name'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const buildings = await db.query(
            'SELECT name, description, color FROM buildings WHERE tenant_id = $1 LIMIT 1',
            [options.tenantId]
          );
          return buildings.length > 0 ? [buildings[0]] : [];
        }
      },
      {
        name: 'Properties',
        headers: ['name', 'owner_name', 'building_name', 'description', 'monthly_service_charge'],
        required: ['name', 'owner_name', 'building_name'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const properties = await db.query(
            `SELECT 
            p.name, 
            c.name as owner_name, 
            b.name as building_name, 
            p.description, 
            p.monthly_service_charge
          FROM properties p
          JOIN contacts c ON p.owner_id = c.id
          JOIN buildings b ON p.building_id = b.id
          WHERE p.tenant_id = $1 LIMIT 1`,
            [options.tenantId]
          );
          return properties.length > 0 ? [properties[0]] : [];
        }
      },
      {
        name: 'Units',
        headers: ['name', 'project_name', 'contact_name', 'sale_price', 'description'],
        required: ['name', 'project_name'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const units = await db.query(
            `SELECT 
            u.name, 
            p.name as project_name, 
            c.name as contact_name, 
            u.sale_price, 
            u.description
          FROM units u
          JOIN projects p ON u.project_id = p.id
          LEFT JOIN contacts c ON u.contact_id = c.id
          WHERE u.tenant_id = $1 LIMIT 1`,
            [options.tenantId]
          );
          return units.length > 0 ? [units[0]] : [];
        }
      },
      {
        name: 'Categories',
        headers: ['name', 'type', 'description', 'is_permanent', 'is_rental', 'parent_category_name'],
        required: ['name', 'type'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const categories = await db.query(
            `SELECT 
            c.name, 
            c.type, 
            c.description, 
            c.is_permanent, 
            c.is_rental, 
            pc.name as parent_category_name
          FROM categories c
          LEFT JOIN categories pc ON c.parent_category_id = pc.id
          WHERE c.tenant_id = $1 LIMIT 1`,
            [options.tenantId]
          );
          return categories.length > 0 ? [categories[0]] : [];
        }
      },
      {
        name: 'Accounts',
        headers: ['name', 'type', 'balance', 'is_permanent', 'description', 'parent_account_name'],
        required: ['name', 'type'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const accounts = await db.query(
            `SELECT 
            a.name, 
            a.type, 
            a.balance, 
            a.is_permanent, 
            a.description, 
            pa.name as parent_account_name
          FROM accounts a
          LEFT JOIN accounts pa ON a.parent_account_id = pa.id
          WHERE a.tenant_id = $1 LIMIT 1`,
            [options.tenantId]
          );
          return accounts.length > 0 ? [accounts[0]] : [];
        }
      },
      {
        name: 'RentalAgreements',
        headers: ['agreement_number', 'property_name', 'tenant_name', 'owner_name', 'broker_name', 'start_date', 'end_date', 'monthly_rent', 'rent_due_date', 'status', 'security_deposit', 'broker_fee', 'description'],
        required: ['agreement_number', 'property_name', 'tenant_name', 'start_date', 'end_date', 'monthly_rent', 'rent_due_date', 'status'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const agreements = await db.query(
            `SELECT 
            ra.agreement_number,
            p.name as property_name,
            t.name as tenant_name,
            o.name as owner_name,
            b.name as broker_name,
            ra.start_date,
            ra.end_date,
            ra.monthly_rent,
            ra.rent_due_date,
            ra.status,
            ra.security_deposit,
            ra.broker_fee,
            ra.description
          FROM rental_agreements ra
          JOIN properties p ON ra.property_id = p.id
          LEFT JOIN contacts t ON ra.contact_id = t.id
          LEFT JOIN contacts o ON ra.owner_id = o.id
          LEFT JOIN contacts b ON ra.broker_id = b.id
          WHERE ra.tenant_id = $1 LIMIT 1`,
            [options.tenantId]
          );
          return agreements.length > 0 ? [agreements[0]] : [];
        }
      },
      {
        name: 'RentalInvoices',
        headers: ['invoice_number', 'tenant_name', 'property_name', 'agreement_number', 'amount', 'paid_amount', 'status', 'issue_date', 'due_date', 'rental_month', 'security_deposit_charge', 'service_charges', 'description'],
        required: ['invoice_number', 'tenant_name', 'amount', 'status', 'issue_date', 'due_date'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const invoices = await db.query(
            `SELECT 
            i.invoice_number,
            c.name as tenant_name,
            p.name as property_name,
            ra.agreement_number,
            i.amount,
            i.paid_amount,
            i.status,
            i.issue_date,
            i.due_date,
            i.rental_month,
            i.security_deposit_charge,
            i.service_charges,
            i.description
          FROM invoices i
          JOIN contacts c ON i.contact_id = c.id
          LEFT JOIN properties p ON i.property_id = p.id
          LEFT JOIN rental_agreements ra ON i.agreement_id = ra.id
          WHERE i.tenant_id = $1 AND i.invoice_type = 'Rental' LIMIT 1`,
            [options.tenantId]
          );
          return invoices.length > 0 ? [invoices[0]] : [];
        }
      },
      {
        name: 'ProjectSellingAgreements',
        headers: ['project_name', 'unit_name', 'lead_name', 'duration_years', 'down_payment_percentage', 'frequency', 'list_price', 'discount_names', 'discount_amounts', 'discount_category_names', 'net_value', 'status', 'description', 'intro_text'],
        required: ['project_name', 'unit_name', 'lead_name', 'duration_years', 'down_payment_percentage', 'frequency', 'list_price', 'net_value', 'status'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const plans = await db.query(
            `SELECT 
            p.name as project_name,
            u.name as unit_name,
            c.name as lead_name,
            ip.duration_years,
            ip.down_payment_percentage,
            ip.frequency,
            ip.list_price,
            ip.net_value,
            ip.status,
            ip.description,
            ip.intro_text
          FROM installment_plans ip
          JOIN projects p ON ip.project_id = p.id
          JOIN units u ON ip.unit_id = u.id
          JOIN contacts c ON ip.lead_id = c.id
          WHERE ip.tenant_id = $1 LIMIT 1`,
            [options.tenantId]
          );
          if (plans.length > 0) {
            return [{
              ...plans[0],
              discount_names: 'CustomerDiscount|FloorDiscount',
              discount_amounts: '5000|2000',
              discount_category_names: 'Sales Discount|Floor Discount'
            }];
          }
          return [{
            project_name: '',
            unit_name: '',
            lead_name: '',
            duration_years: 5,
            down_payment_percentage: 20,
            frequency: 'Monthly',
            list_price: 100000,
            discount_names: 'CustomerDiscount',
            discount_amounts: '5000',
            discount_category_names: 'Sales Discount',
            net_value: 95000,
            status: 'Draft',
            description: '',
            intro_text: ''
          }];
        }
      },
      {
        name: 'LoanTransactions',
        headers: ['subtype', 'amount', 'date', 'description', 'bankAccountName', 'contactName'],
        required: ['subtype', 'amount', 'date', 'bankAccountName'],
        getSampleData: async () => {
          if (!options.includeSampleData) return [];
          const rows = await db.query(
            `SELECT 
            t.subtype,
            t.amount,
            t.date,
            t.description,
            a.name as bank_account_name,
            c.name as contact_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id AND a.type = 'Bank'
          LEFT JOIN contacts c ON t.contact_id = c.id
          WHERE t.tenant_id = $1 AND t.type = 'Loan' LIMIT 1`,
            [options.tenantId]
          );
          if (rows.length === 0) {
            const bankAccount = await db.query(
              `SELECT name FROM accounts WHERE (tenant_id = $1 OR tenant_id IS NULL) AND type = 'Bank' LIMIT 1`,
              [options.tenantId]
            );
            if (bankAccount.length === 0) return [];
            return [{
              subtype: 'Receive Loan',
              amount: 0,
              date: new Date().toISOString().split('T')[0],
              description: '',
              bankAccountName: bankAccount[0].name,
              contactName: ''
            }];
          }
          return [{
            subtype: rows[0].subtype,
            amount: rows[0].amount,
            date: rows[0].date,
            description: rows[0].description || '',
            bankAccountName: rows[0].bank_account_name || '',
            contactName: rows[0].contact_name || ''
          }];
        }
      }
    ];

    // Filter to single sheet if requested
    let sheets = allSheets;
    if (options.sheetName) {
      console.log(`[TemplateService] Requested sheet: "${options.sheetName}"`);
      console.log(`[TemplateService] Available sheets:`, allSheets.map(s => s.name));
      sheets = allSheets.filter(s => s.name === options.sheetName);
      console.log(`[TemplateService] Filtered sheets count:`, sheets.length);
      if (sheets.length === 0) {
        const availableSheets = allSheets.map(s => s.name).join(', ');
        console.error(`[TemplateService] ERROR: Sheet "${options.sheetName}" not found. Available sheets: ${availableSheets}`);
        throw new Error(`Invalid sheet name: "${options.sheetName}". Available sheets: ${availableSheets}`);
      }
    }

    // Generate each sheet
    for (const sheet of sheets) {
      const rows: any[] = [];

      // Add header row
      rows.push(sheet.headers);

      // Add sample data if requested
      if (options.includeSampleData) {
        const sampleData = await sheet.getSampleData();
        if (sampleData.length > 0) {
          // Convert sample data to array matching header order
          const sampleRow = sheet.headers.map(header => {
            const value = sampleData[0][header];
            return value !== null && value !== undefined ? value : '';
          });
          rows.push(sampleRow);
        }
      }

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(rows);

      // Set column widths (optional, for better readability)
      const colWidths = sheet.headers.map(() => ({ wch: 20 }));
      worksheet['!cols'] = colWidths;

      // Add sheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    }

    // Convert to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  } catch (error: any) {
    console.error('Error in generateTemplate:', error);
    throw new Error(`Failed to generate template: ${error.message || 'Unknown error'}`);
  }
}
