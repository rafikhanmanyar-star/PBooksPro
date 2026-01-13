import * as XLSX from 'xlsx';
import { getDatabaseService } from './databaseService.js';
import { generateTemplate } from './templateService.js';

/**
 * Export all current data for the specified tenant
 * Returns Excel file with all entity data + sample entries
 */
export async function exportData(tenantId: string): Promise<Buffer> {
  const db = getDatabaseService();
  const workbook = XLSX.utils.book_new();

  // Export Contacts
  const contacts = await db.query(
    'SELECT name, type, description, contact_no, company_name, address FROM contacts WHERE tenant_id = $1 ORDER BY name',
    [tenantId]
  );
  if (contacts.length > 0) {
    const contactsSheet = XLSX.utils.json_to_sheet(contacts);
    XLSX.utils.book_append_sheet(workbook, contactsSheet, 'Contacts');
  }

  // Export Projects
  const projects = await db.query(
    'SELECT name, description, color, status FROM projects WHERE tenant_id = $1 ORDER BY name',
    [tenantId]
  );
  if (projects.length > 0) {
    const projectsSheet = XLSX.utils.json_to_sheet(projects);
    XLSX.utils.book_append_sheet(workbook, projectsSheet, 'Projects');
  }

  // Export Buildings
  const buildings = await db.query(
    'SELECT name, description, color FROM buildings WHERE tenant_id = $1 ORDER BY name',
    [tenantId]
  );
  if (buildings.length > 0) {
    const buildingsSheet = XLSX.utils.json_to_sheet(buildings);
    XLSX.utils.book_append_sheet(workbook, buildingsSheet, 'Buildings');
  }

  // Export Properties (with foreign key names resolved)
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
    WHERE p.tenant_id = $1 ORDER BY p.name`,
    [tenantId]
  );
  if (properties.length > 0) {
    const propertiesSheet = XLSX.utils.json_to_sheet(properties);
    XLSX.utils.book_append_sheet(workbook, propertiesSheet, 'Properties');
  }

  // Export Units (with foreign key names resolved)
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
    WHERE u.tenant_id = $1 ORDER BY u.name`,
    [tenantId]
  );
  if (units.length > 0) {
    const unitsSheet = XLSX.utils.json_to_sheet(units);
    XLSX.utils.book_append_sheet(workbook, unitsSheet, 'Units');
  }

  // Export Rental Agreements (with foreign key names resolved)
  const rentalAgreements = await db.query(
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
    WHERE ra.tenant_id = $1 ORDER BY ra.agreement_number`,
    [tenantId]
  );
  if (rentalAgreements.length > 0) {
    const rentalAgreementsSheet = XLSX.utils.json_to_sheet(rentalAgreements);
    XLSX.utils.book_append_sheet(workbook, rentalAgreementsSheet, 'RentalAgreements');
  }

  // Export Categories (with foreign key names resolved)
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
    WHERE c.tenant_id = $1 ORDER BY c.name`,
    [tenantId]
  );
  if (categories.length > 0) {
    const categoriesSheet = XLSX.utils.json_to_sheet(categories);
    XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');
  }

  // Export Accounts (with foreign key names resolved)
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
    WHERE a.tenant_id = $1 ORDER BY a.name`,
    [tenantId]
  );
  if (accounts.length > 0) {
    const accountsSheet = XLSX.utils.json_to_sheet(accounts);
    XLSX.utils.book_append_sheet(workbook, accountsSheet, 'Accounts');
  }

  // If no data exists, generate template with sample structure
  if (workbook.SheetNames.length === 0) {
    return await generateTemplate({ tenantId, includeSampleData: false });
  }

  // Add sample entry row to each sheet (duplicate first row if exists)
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    if (jsonData.length > 0) {
      // Add sample row (copy of first row)
      const sampleRow = jsonData[0];
      jsonData.push(sampleRow);
      
      // Recreate sheet with sample row
      const newSheet = XLSX.utils.json_to_sheet(jsonData);
      workbook.Sheets[sheetName] = newSheet;
    }
  }

  // Convert to buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
