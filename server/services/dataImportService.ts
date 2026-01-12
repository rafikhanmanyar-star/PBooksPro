import * as XLSX from 'xlsx';
import { getDatabaseService } from './databaseService.js';

export interface ValidationError {
  sheet: string;
  row: number; // Excel row number (1-indexed, including header)
  field: string;
  value: any;
  message: string;
}

export interface DuplicateEntry {
  sheet: string;
  row: number;
  name: string;
  reason: string;
}

export interface ImportResult {
  success: boolean;
  canProceed: boolean;
  validationErrors: ValidationError[];
  duplicates: DuplicateEntry[];
  imported?: {
    contacts: { count: number; skipped: number };
    projects: { count: number; skipped: number };
    buildings: { count: number; skipped: number };
    properties: { count: number; skipped: number };
    units: { count: number; skipped: number };
    categories: { count: number; skipped: number };
    accounts: { count: number; skipped: number };
  };
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    duplicateRows: number;
    importedRows?: number;
  };
}

/**
 * Import data from Excel file with all-or-nothing validation
 * Returns detailed results including validation errors and duplicates
 */
export async function importData(
  fileBuffer: Buffer,
  tenantId: string,
  userId: string
): Promise<ImportResult> {
  const db = getDatabaseService();
  
  // Parse Excel file
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const validationErrors: ValidationError[] = [];
  const duplicates: DuplicateEntry[] = [];
  let totalRows = 0;
  let errorRows = 0;
  let duplicateRows = 0;

  // Required sheets
  const requiredSheets = ['Contacts', 'Projects', 'Buildings', 'Properties', 'Units', 'Categories', 'Accounts'];
  
  // Validate sheet structure
  for (const sheetName of requiredSheets) {
    if (!workbook.SheetNames.includes(sheetName)) {
      validationErrors.push({
        sheet: sheetName,
        row: 0,
        field: 'sheet',
        value: null,
        message: `Required sheet "${sheetName}" is missing`
      });
    }
  }

  // If sheets are missing, return early
  if (validationErrors.length > 0) {
    return {
      success: false,
      canProceed: false,
      validationErrors,
      duplicates: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        errorRows: validationErrors.length,
        duplicateRows: 0
      }
    };
  }

  // Validation phase - collect all errors before any DB writes
  const validatedData: {
    contacts: any[];
    projects: any[];
    buildings: any[];
    properties: any[];
    units: any[];
    categories: any[];
    accounts: any[];
  } = {
    contacts: [],
    projects: [],
    buildings: [],
    properties: [],
    units: [],
    categories: [],
    accounts: []
  };

  // Validate and process each sheet
  await validateSheet('Contacts', workbook, db, tenantId, validatedData, validationErrors, duplicates);
  await validateSheet('Projects', workbook, db, tenantId, validatedData, validationErrors, duplicates);
  await validateSheet('Buildings', workbook, db, tenantId, validatedData, validationErrors, duplicates);
  await validateSheet('Properties', workbook, db, tenantId, validatedData, validationErrors, duplicates);
  await validateSheet('Units', workbook, db, tenantId, validatedData, validationErrors, duplicates);
  await validateSheet('Categories', workbook, db, tenantId, validatedData, validationErrors, duplicates);
  await validateSheet('Accounts', workbook, db, tenantId, validatedData, validationErrors, duplicates);

  // Count rows
  totalRows = Object.values(validatedData).reduce((sum, arr) => sum + arr.length, 0);
  errorRows = validationErrors.length;
  duplicateRows = duplicates.length;

  // Decision point: If ANY validation errors exist, STOP
  if (validationErrors.length > 0) {
    return {
      success: false,
      canProceed: false,
      validationErrors,
      duplicates,
      summary: {
        totalRows,
        validRows: totalRows - errorRows - duplicateRows,
        errorRows,
        duplicateRows
      }
    };
  }

  // Import phase - only if validation passed completely
  const imported = {
    contacts: { count: 0, skipped: 0 },
    projects: { count: 0, skipped: 0 },
    buildings: { count: 0, skipped: 0 },
    properties: { count: 0, skipped: 0 },
    units: { count: 0, skipped: 0 },
    categories: { count: 0, skipped: 0 },
    accounts: { count: 0, skipped: 0 }
  };

  let importedRows = 0;

  // Use transaction for atomicity
  await db.transaction(async (client) => {
    // Import Contacts
    for (const contact of validatedData.contacts) {
      const existing = await client.query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
        [tenantId, contact.name.trim()]
      );
      if (existing.length > 0) {
        imported.contacts.skipped++;
        continue;
      }
      const id = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [id, tenantId, contact.name.trim(), contact.type, contact.description || null, contact.contact_no || null, contact.company_name || null, contact.address || null]
      );
      imported.contacts.count++;
      importedRows++;
    }

    // Import Projects
    for (const project of validatedData.projects) {
      const existing = await client.query(
        'SELECT id FROM projects WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
        [tenantId, project.name.trim()]
      );
      if (existing.length > 0) {
        imported.projects.skipped++;
        continue;
      }
      const id = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO projects (id, tenant_id, name, description, color, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [id, tenantId, project.name.trim(), project.description || null, project.color || null, project.status || null]
      );
      imported.projects.count++;
      importedRows++;
    }

    // Import Buildings
    for (const building of validatedData.buildings) {
      const existing = await client.query(
        'SELECT id FROM buildings WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
        [tenantId, building.name.trim()]
      );
      if (existing.length > 0) {
        imported.buildings.skipped++;
        continue;
      }
      const id = `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO buildings (id, tenant_id, name, description, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [id, tenantId, building.name.trim(), building.description || null, building.color || null]
      );
      imported.buildings.count++;
      importedRows++;
    }

    // Import Properties
    for (const property of validatedData.properties) {
      const existing = await client.query(
        'SELECT id FROM properties WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
        [tenantId, property.name.trim()]
      );
      if (existing.length > 0) {
        imported.properties.skipped++;
        continue;
      }
      const id = `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO properties (id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [id, tenantId, property.name.trim(), property.owner_id, property.building_id, property.description || null, property.monthly_service_charge || null]
      );
      imported.properties.count++;
      importedRows++;
    }

    // Import Units
    for (const unit of validatedData.units) {
      const existing = await client.query(
        'SELECT id FROM units WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
        [tenantId, unit.name.trim()]
      );
      if (existing.length > 0) {
        imported.units.skipped++;
        continue;
      }
      const id = `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO units (id, tenant_id, name, project_id, contact_id, sale_price, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [id, tenantId, unit.name.trim(), unit.project_id, unit.contact_id || null, unit.sale_price || null, unit.description || null]
      );
      imported.units.count++;
      importedRows++;
    }

    // Import Categories
    for (const category of validatedData.categories) {
      const existing = await client.query(
        'SELECT id FROM categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
        [tenantId, category.name.trim(), category.type]
      );
      if (existing.length > 0) {
        imported.categories.skipped++;
        continue;
      }
      const id = `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO categories (id, tenant_id, name, type, description, is_permanent, is_rental, parent_category_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [id, tenantId, category.name.trim(), category.type, category.description || null, category.is_permanent || false, category.is_rental || false, category.parent_category_id || null]
      );
      imported.categories.count++;
      importedRows++;
    }

    // Import Accounts
    for (const account of validatedData.accounts) {
      const existing = await client.query(
        'SELECT id FROM accounts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
        [tenantId, account.name.trim(), account.type]
      );
      if (existing.length > 0) {
        imported.accounts.skipped++;
        continue;
      }
      const id = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, parent_account_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [id, tenantId, account.name.trim(), account.type, account.balance || 0, account.is_permanent || false, account.description || null, account.parent_account_id || null]
      );
      imported.accounts.count++;
      importedRows++;
    }
  });

  return {
    success: true,
    canProceed: true,
    validationErrors: [],
    duplicates,
    imported,
    summary: {
      totalRows,
      validRows: totalRows - duplicateRows,
      errorRows: 0,
      duplicateRows,
      importedRows
    }
  };
}

/**
 * Validate a sheet and collect data/errors
 */
async function validateSheet(
  sheetName: string,
  workbook: XLSX.WorkBook,
  db: any,
  tenantId: string,
  validatedData: any,
  validationErrors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return;

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i] as any;
    const excelRow = i + 2; // +2 because: 1 for header, 1 for 0-index to 1-index

    // Validate based on sheet type
    switch (sheetName) {
      case 'Contacts':
        await validateContactRow(row, excelRow, db, tenantId, validatedData.contacts, validationErrors, duplicates);
        break;
      case 'Projects':
        await validateProjectRow(row, excelRow, db, tenantId, validatedData.projects, validationErrors, duplicates);
        break;
      case 'Buildings':
        await validateBuildingRow(row, excelRow, db, tenantId, validatedData.buildings, validationErrors, duplicates);
        break;
      case 'Properties':
        await validatePropertyRow(row, excelRow, db, tenantId, validatedData.properties, validationErrors, duplicates);
        break;
      case 'Units':
        await validateUnitRow(row, excelRow, db, tenantId, validatedData.units, validationErrors, duplicates);
        break;
      case 'Categories':
        await validateCategoryRow(row, excelRow, db, tenantId, validatedData.categories, validationErrors, duplicates);
        break;
      case 'Accounts':
        await validateAccountRow(row, excelRow, db, tenantId, validatedData.accounts, validationErrors, duplicates);
        break;
    }
  }
}

async function validateContactRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  // Check required fields
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Contacts',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }
  if (!row.type || !row.type.toString().trim()) {
    errors.push({
      sheet: 'Contacts',
      row: excelRow,
      field: 'type',
      value: row.type,
      message: 'Type is required'
    });
    return;
  }

  // Check for duplicates
  const existing = await db.query(
    'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.name.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Contacts',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Contact with this name already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    type: row.type.toString().trim(),
    description: row.description ? row.description.toString().trim() : null,
    contact_no: row.contact_no ? row.contact_no.toString().trim() : null,
    company_name: row.company_name ? row.company_name.toString().trim() : null,
    address: row.address ? row.address.toString().trim() : null
  });
}

async function validateProjectRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Projects',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }

  const existing = await db.query(
    'SELECT id FROM projects WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.name.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Projects',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Project with this name already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    description: row.description ? row.description.toString().trim() : null,
    color: row.color ? row.color.toString().trim() : null,
    status: row.status ? row.status.toString().trim() : null
  });
}

async function validateBuildingRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Buildings',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }

  const existing = await db.query(
    'SELECT id FROM buildings WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.name.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Buildings',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Building with this name already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    description: row.description ? row.description.toString().trim() : null,
    color: row.color ? row.color.toString().trim() : null
  });
}

async function validatePropertyRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Properties',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }
  if (!row.owner_name || !row.owner_name.toString().trim()) {
    errors.push({
      sheet: 'Properties',
      row: excelRow,
      field: 'owner_name',
      value: row.owner_name,
      message: 'Owner name is required'
    });
    return;
  }
  if (!row.building_name || !row.building_name.toString().trim()) {
    errors.push({
      sheet: 'Properties',
      row: excelRow,
      field: 'building_name',
      value: row.building_name,
      message: 'Building name is required'
    });
    return;
  }

  // Resolve foreign keys
  const owner = await db.query(
    'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.owner_name.toString().trim()]
  );
  if (owner.length === 0) {
    errors.push({
      sheet: 'Properties',
      row: excelRow,
      field: 'owner_name',
      value: row.owner_name,
      message: `Owner "${row.owner_name}" not found in Contacts`
    });
    return;
  }

  const building = await db.query(
    'SELECT id FROM buildings WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.building_name.toString().trim()]
  );
  if (building.length === 0) {
    errors.push({
      sheet: 'Properties',
      row: excelRow,
      field: 'building_name',
      value: row.building_name,
      message: `Building "${row.building_name}" not found in Buildings`
    });
    return;
  }

  const existing = await db.query(
    'SELECT id FROM properties WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.name.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Properties',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Property with this name already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    owner_id: owner[0].id,
    building_id: building[0].id,
    description: row.description ? row.description.toString().trim() : null,
    monthly_service_charge: row.monthly_service_charge ? parseFloat(row.monthly_service_charge.toString()) : null
  });
}

async function validateUnitRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Units',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }
  if (!row.project_name || !row.project_name.toString().trim()) {
    errors.push({
      sheet: 'Units',
      row: excelRow,
      field: 'project_name',
      value: row.project_name,
      message: 'Project name is required'
    });
    return;
  }

  // Resolve foreign keys
  const project = await db.query(
    'SELECT id FROM projects WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.project_name.toString().trim()]
  );
  if (project.length === 0) {
    errors.push({
      sheet: 'Units',
      row: excelRow,
      field: 'project_name',
      value: row.project_name,
      message: `Project "${row.project_name}" not found in Projects`
    });
    return;
  }

  let contactId = null;
  if (row.contact_name && row.contact_name.toString().trim()) {
    const contact = await db.query(
      'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
      [tenantId, row.contact_name.toString().trim()]
    );
    if (contact.length === 0) {
      errors.push({
        sheet: 'Units',
        row: excelRow,
        field: 'contact_name',
        value: row.contact_name,
        message: `Contact "${row.contact_name}" not found in Contacts`
      });
      return;
    }
    contactId = contact[0].id;
  }

  const existing = await db.query(
    'SELECT id FROM units WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.name.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Units',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Unit with this name already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    project_id: project[0].id,
    contact_id: contactId,
    sale_price: row.sale_price ? parseFloat(row.sale_price.toString()) : null,
    description: row.description ? row.description.toString().trim() : null
  });
}

async function validateCategoryRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Categories',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }
  if (!row.type || !row.type.toString().trim()) {
    errors.push({
      sheet: 'Categories',
      row: excelRow,
      field: 'type',
      value: row.type,
      message: 'Type is required'
    });
    return;
  }

  // Resolve parent category if provided
  let parentCategoryId = null;
  if (row.parent_category_name && row.parent_category_name.toString().trim()) {
    const parent = await db.query(
      'SELECT id FROM categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
      [tenantId, row.parent_category_name.toString().trim(), row.type.toString().trim()]
    );
    if (parent.length === 0) {
      errors.push({
        sheet: 'Categories',
        row: excelRow,
        field: 'parent_category_name',
        value: row.parent_category_name,
        message: `Parent category "${row.parent_category_name}" not found in Categories`
      });
      return;
    }
    parentCategoryId = parent[0].id;
  }

  const existing = await db.query(
    'SELECT id FROM categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
    [tenantId, row.name.toString().trim(), row.type.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Categories',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Category with this name and type already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    type: row.type.toString().trim(),
    description: row.description ? row.description.toString().trim() : null,
    is_permanent: row.is_permanent === true || row.is_permanent === 'true' || row.is_permanent === 'TRUE' || row.is_permanent === 1 || row.is_permanent === '1',
    is_rental: row.is_rental === true || row.is_rental === 'true' || row.is_rental === 'TRUE' || row.is_rental === 1 || row.is_rental === '1',
    parent_category_id: parentCategoryId
  });
}

async function validateAccountRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  if (!row.name || !row.name.toString().trim()) {
    errors.push({
      sheet: 'Accounts',
      row: excelRow,
      field: 'name',
      value: row.name,
      message: 'Name is required'
    });
    return;
  }
  if (!row.type || !row.type.toString().trim()) {
    errors.push({
      sheet: 'Accounts',
      row: excelRow,
      field: 'type',
      value: row.type,
      message: 'Type is required'
    });
    return;
  }

  // Resolve parent account if provided
  let parentAccountId = null;
  if (row.parent_account_name && row.parent_account_name.toString().trim()) {
    const parent = await db.query(
      'SELECT id FROM accounts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
      [tenantId, row.parent_account_name.toString().trim(), row.type.toString().trim()]
    );
    if (parent.length === 0) {
      errors.push({
        sheet: 'Accounts',
        row: excelRow,
        field: 'parent_account_name',
        value: row.parent_account_name,
        message: `Parent account "${row.parent_account_name}" not found in Accounts`
      });
      return;
    }
    parentAccountId = parent[0].id;
  }

  const existing = await db.query(
    'SELECT id FROM accounts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
    [tenantId, row.name.toString().trim(), row.type.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'Accounts',
      row: excelRow,
      name: row.name.toString().trim(),
      reason: 'Account with this name and type already exists'
    });
    return;
  }

  validatedData.push({
    name: row.name.toString().trim(),
    type: row.type.toString().trim(),
    balance: row.balance ? parseFloat(row.balance.toString()) : 0,
    is_permanent: row.is_permanent === true || row.is_permanent === 'true' || row.is_permanent === 'TRUE' || row.is_permanent === 1 || row.is_permanent === '1',
    description: row.description ? row.description.toString().trim() : null,
    parent_account_id: parentAccountId
  });
}
