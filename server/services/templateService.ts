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
  { name: 'RentalAgreements', dependencies: ['Properties', 'Contacts'], description: 'Import rental agreements (depends on Properties and Contacts)' }
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
      headers: ['agreement_number', 'property_name', 'owner_name', 'broker_name', 'start_date', 'end_date', 'monthly_rent', 'rent_due_date', 'status', 'security_deposit', 'broker_fee', 'description'],
      required: ['agreement_number', 'property_name', 'start_date', 'end_date', 'monthly_rent', 'rent_due_date', 'status'],
      getSampleData: async () => {
        if (!options.includeSampleData) return [];
        const agreements = await db.query(
          `SELECT 
            ra.agreement_number,
            p.name as property_name,
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
          LEFT JOIN contacts o ON ra.owner_id = o.id
          LEFT JOIN contacts b ON ra.broker_id = b.id
          WHERE ra.tenant_id = $1 LIMIT 1`,
          [options.tenantId]
        );
        return agreements.length > 0 ? [agreements[0]] : [];
      }
    }
  ];

  // Filter to single sheet if requested
  const sheets = options.sheetName 
    ? allSheets.filter(s => s.name === options.sheetName)
    : allSheets;

  if (options.sheetName && sheets.length === 0) {
    throw new Error(`Invalid sheet name: ${options.sheetName}`);
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
