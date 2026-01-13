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

export interface SheetResult {
  sheet: string;
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  errorDetails?: ValidationError[];
}

export interface ImportResult {
  success: boolean;
  canProceed: boolean;
  validationErrors: ValidationError[];
  duplicates: DuplicateEntry[];
  sheetResults?: SheetResult[];
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
 * @param sheetName - If provided, imports only this sheet
 */
export async function importData(
  fileBuffer: Buffer,
  tenantId: string,
  userId: string,
  sheetName?: string
): Promise<ImportResult> {
  const db = getDatabaseService();
  
  // Parse Excel file
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const validationErrors: ValidationError[] = [];
  const duplicates: DuplicateEntry[] = [];
  let totalRows = 0;
  let errorRows = 0;
  let duplicateRows = 0;

  // Define import order with dependencies
  // Order: Accounts → Contacts → Categories → Projects → Buildings → Units → Properties → RentalAgreements
  const importOrder = [
    { name: 'Accounts', dependencies: [] },
    { name: 'Contacts', dependencies: [] },
    { name: 'Categories', dependencies: [] },
    { name: 'Projects', dependencies: [] },
    { name: 'Buildings', dependencies: [] },
    { name: 'Units', dependencies: ['Projects', 'Contacts'] }, // Contacts is optional
    { name: 'Properties', dependencies: ['Contacts', 'Buildings'] },
    { name: 'RentalAgreements', dependencies: ['Properties', 'Contacts'] }
  ];

  // If single sheet import, filter to that sheet only
  const sheetsToProcess = sheetName 
    ? importOrder.filter(s => s.name === sheetName)
    : importOrder;

  if (sheetName && sheetsToProcess.length === 0) {
    return {
      success: false,
      canProceed: false,
      validationErrors: [{
        sheet: sheetName,
        row: 0,
        field: 'sheet',
        value: null,
        message: `Invalid sheet name: ${sheetName}. Valid sheets: ${importOrder.map(s => s.name).join(', ')}`
      }],
      duplicates: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        errorRows: 1,
        duplicateRows: 0
      }
    };
  }
  
  // Validate sheet structure
  for (const sheet of sheetsToProcess) {
    if (!workbook.SheetNames.includes(sheet.name)) {
      validationErrors.push({
        sheet: sheet.name,
        row: 0,
        field: 'sheet',
        value: null,
        message: `Required sheet "${sheet.name}" is missing`
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
  // Process sheets in order and track which sheets have errors
  const validatedData: {
    contacts: any[];
    projects: any[];
    buildings: any[];
    properties: any[];
    units: any[];
    categories: any[];
    accounts: any[];
    rentalAgreements: any[];
  } = {
    contacts: [],
    projects: [],
    buildings: [],
    properties: [],
    units: [],
    categories: [],
    accounts: [],
    rentalAgreements: []
  };

  const sheetErrors: { [sheetName: string]: ValidationError[] } = {};
  const failedSheets = new Set<string>();

  // Validate sheets in order
  for (const sheet of sheetsToProcess) {
    // Check if dependencies failed
    const dependencyFailed = sheet.dependencies.some(dep => failedSheets.has(dep));
    if (dependencyFailed) {
      // Skip validation for this sheet since dependency failed
      const depList = sheet.dependencies.filter(d => failedSheets.has(d)).join(', ');
      validationErrors.push({
        sheet: sheet.name,
        row: 0,
        field: 'dependencies',
        value: null,
        message: `Cannot import ${sheet.name} because dependencies failed: ${depList}`
      });
      failedSheets.add(sheet.name);
      continue;
    }

    // Validate this sheet
    const beforeErrorCount = validationErrors.length;
    await validateSheet(sheet.name, workbook, db, tenantId, validatedData, validationErrors, duplicates);
    
    // Check if this sheet has errors
    const sheetErrorCount = validationErrors.length - beforeErrorCount;
    if (sheetErrorCount > 0) {
      sheetErrors[sheet.name] = validationErrors.slice(beforeErrorCount);
      failedSheets.add(sheet.name);
    }
  }

  // Count rows
  totalRows = Object.values(validatedData).reduce((sum, arr) => sum + arr.length, 0);
  errorRows = validationErrors.length;
  duplicateRows = duplicates.length;

  // Decision point: If ANY validation errors exist, STOP
  if (validationErrors.length > 0) {
    // Create sheet-wise results
    const sheetResults: SheetResult[] = importOrder.map(sheet => {
      const errors = sheetErrors[sheet.name] || [];
      const hasErrors = failedSheets.has(sheet.name);
      return {
        sheet: sheet.name,
        success: !hasErrors && errors.length === 0,
        imported: 0,
        skipped: 0,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined
      };
    });

    return {
      success: false,
      canProceed: false,
      validationErrors,
      duplicates,
      sheetResults,
      summary: {
        totalRows,
        validRows: totalRows - errorRows - duplicateRows,
        errorRows,
        duplicateRows
      }
    };
  }

  // Import phase - process sheets in order, stop if dependency fails
  const imported = {
    contacts: { count: 0, skipped: 0 },
    projects: { count: 0, skipped: 0 },
    buildings: { count: 0, skipped: 0 },
    properties: { count: 0, skipped: 0 },
    units: { count: 0, skipped: 0 },
    categories: { count: 0, skipped: 0 },
    accounts: { count: 0, skipped: 0 },
    rentalAgreements: { count: 0, skipped: 0 }
  };

  const sheetResults: SheetResult[] = [];
  let importedRows = 0;
  const importFailedSheets = new Set<string>();

  // Use transaction for atomicity
  await db.transaction(async (client) => {
    // Import in order: Accounts → Contacts → Categories → Projects → Buildings → Units → Properties
    for (const sheet of sheetsToProcess) {
      // Check if dependencies failed
      const dependencyFailed = sheet.dependencies.some(dep => importFailedSheets.has(dep));
      if (dependencyFailed) {
        const depList = sheet.dependencies.filter(d => importFailedSheets.has(d)).join(', ');
        sheetResults.push({
          sheet: sheet.name,
          success: false,
          imported: 0,
          skipped: 0,
          errors: 0,
          errorDetails: [{
            sheet: sheet.name,
            row: 0,
            field: 'dependencies',
            value: null,
            message: `Skipped ${sheet.name} because dependencies failed: ${depList}`
          }]
        });
        importFailedSheets.add(sheet.name);
        continue;
      }

      // Import this sheet
      let sheetImported = 0;
      let sheetSkipped = 0;
      let sheetErrors: ValidationError[] = [];

      try {
        switch (sheet.name) {
          case 'Accounts':
            for (const account of validatedData.accounts) {
              const existing = await client.query(
                'SELECT id FROM accounts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
                [tenantId, account.name.trim(), account.type]
              );
              if (existing.rows.length > 0) {
                imported.accounts.skipped++;
                sheetSkipped++;
                continue;
              }
              const accountId = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, parent_account_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [accountId, tenantId, account.name.trim(), account.type, account.balance || 0, account.is_permanent || false, account.description || null, account.parent_account_id || null]
              );
              imported.accounts.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'Contacts':
            for (const contact of validatedData.contacts) {
              const existing = await client.query(
                'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
                [tenantId, contact.name.trim()]
              );
              if (existing.rows.length > 0) {
                imported.contacts.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [id, tenantId, contact.name.trim(), contact.type, contact.description || null, contact.contact_no || null, contact.company_name || null, contact.address || null]
              );
              imported.contacts.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'Categories':
            for (const category of validatedData.categories) {
              const existing = await client.query(
                'SELECT id FROM categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND type = $3',
                [tenantId, category.name.trim(), category.type]
              );
              if (existing.rows.length > 0) {
                imported.categories.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO categories (id, tenant_id, name, type, description, is_permanent, is_rental, parent_category_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [id, tenantId, category.name.trim(), category.type, category.description || null, category.is_permanent || false, category.is_rental || false, category.parent_category_id || null]
              );
              imported.categories.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'Projects':
            for (const project of validatedData.projects) {
              const existing = await client.query(
                'SELECT id FROM projects WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
                [tenantId, project.name.trim()]
              );
              if (existing.rows.length > 0) {
                imported.projects.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO projects (id, tenant_id, name, description, color, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                [id, tenantId, project.name.trim(), project.description || null, project.color || null, project.status || null]
              );
              imported.projects.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'Buildings':
            for (const building of validatedData.buildings) {
              const existing = await client.query(
                'SELECT id FROM buildings WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
                [tenantId, building.name.trim()]
              );
              if (existing.rows.length > 0) {
                imported.buildings.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO buildings (id, tenant_id, name, description, color, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [id, tenantId, building.name.trim(), building.description || null, building.color || null]
              );
              imported.buildings.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'Units':
            for (const unit of validatedData.units) {
              const existing = await client.query(
                'SELECT id FROM units WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
                [tenantId, unit.name.trim()]
              );
              if (existing.rows.length > 0) {
                imported.units.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO units (id, tenant_id, name, project_id, contact_id, sale_price, description, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [id, tenantId, unit.name.trim(), unit.project_id, unit.contact_id || null, unit.sale_price || null, unit.description || null]
              );
              imported.units.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'Properties':
            for (const property of validatedData.properties) {
              const existing = await client.query(
                'SELECT id FROM properties WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
                [tenantId, property.name.trim()]
              );
              if (existing.rows.length > 0) {
                imported.properties.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO properties (id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [id, tenantId, property.name.trim(), property.owner_id, property.building_id, property.description || null, property.monthly_service_charge || null]
              );
              imported.properties.count++;
              sheetImported++;
              importedRows++;
            }
            break;

          case 'RentalAgreements':
            for (const agreement of validatedData.rentalAgreements) {
              const existing = await client.query(
                'SELECT id FROM rental_agreements WHERE tenant_id = $1 AND LOWER(TRIM(agreement_number)) = LOWER($2)',
                [tenantId, agreement.agreement_number.trim()]
              );
              if (existing.rows.length > 0) {
                imported.rentalAgreements.skipped++;
                sheetSkipped++;
                continue;
              }
              const id = `rental_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await client.query(
                `INSERT INTO rental_agreements (id, tenant_id, agreement_number, property_id, contact_id, owner_id, broker_id, start_date, end_date, monthly_rent, rent_due_date, status, security_deposit, broker_fee, description, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
                [id, tenantId, agreement.agreement_number.trim(), agreement.property_id, agreement.tenant_id, agreement.owner_id, agreement.broker_id, agreement.start_date, agreement.end_date, agreement.monthly_rent, agreement.rent_due_date, agreement.status, agreement.security_deposit, agreement.broker_fee, agreement.description]
              );
              imported.rentalAgreements.count++;
              sheetImported++;
              importedRows++;
            }
            break;
        }

        // Record sheet result
        sheetResults.push({
          sheet: sheet.name,
          success: sheetErrors.length === 0,
          imported: sheetImported,
          skipped: sheetSkipped,
          errors: sheetErrors.length,
          errorDetails: sheetErrors.length > 0 ? sheetErrors : undefined
        });

        // If this sheet had errors, mark it as failed
        if (sheetErrors.length > 0) {
          importFailedSheets.add(sheet.name);
        }
      } catch (error: any) {
        // Record error for this sheet
        sheetErrors.push({
          sheet: sheet.name,
          row: 0,
          field: 'import',
          value: null,
          message: `Import failed: ${error.message || 'Unknown error'}`
        });
        sheetResults.push({
          sheet: sheet.name,
          success: false,
          imported: sheetImported,
          skipped: sheetSkipped,
          errors: sheetErrors.length,
          errorDetails: sheetErrors
        });
        importFailedSheets.add(sheet.name);
      }
    }
  });

  return {
    success: true,
    canProceed: true,
    validationErrors: [],
    duplicates,
    sheetResults,
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
      case 'RentalAgreements':
        await validateRentalAgreementRow(row, excelRow, db, tenantId, validatedData.rentalAgreements, validationErrors, duplicates);
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

async function validateRentalAgreementRow(
  row: any,
  excelRow: number,
  db: any,
  tenantId: string,
  validatedData: any[],
  errors: ValidationError[],
  duplicates: DuplicateEntry[]
): Promise<void> {
  // Required fields
  if (!row.agreement_number || !row.agreement_number.toString().trim()) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'agreement_number',
      value: row.agreement_number,
      message: 'Agreement number is required'
    });
    return;
  }

  if (!row.property_name || !row.property_name.toString().trim()) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'property_name',
      value: row.property_name,
      message: 'Property name is required'
    });
    return;
  }

  if (!row.tenant_name || !row.tenant_name.toString().trim()) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'tenant_name',
      value: row.tenant_name,
      message: 'Tenant name is required'
    });
    return;
  }

  if (!row.start_date) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'start_date',
      value: row.start_date,
      message: 'Start date is required'
    });
    return;
  }

  if (!row.end_date) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'end_date',
      value: row.end_date,
      message: 'End date is required'
    });
    return;
  }

  if (!row.monthly_rent) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'monthly_rent',
      value: row.monthly_rent,
      message: 'Monthly rent is required'
    });
    return;
  }

  if (!row.rent_due_date) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'rent_due_date',
      value: row.rent_due_date,
      message: 'Rent due date (day of month) is required'
    });
    return;
  }

  if (!row.status || !row.status.toString().trim()) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'status',
      value: row.status,
      message: 'Status is required'
    });
    return;
  }

  // Check for duplicates
  const existing = await db.query(
    'SELECT id FROM rental_agreements WHERE tenant_id = $1 AND LOWER(TRIM(agreement_number)) = LOWER($2)',
    [tenantId, row.agreement_number.toString().trim()]
  );
  if (existing.length > 0) {
    duplicates.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      name: row.agreement_number.toString().trim(),
      reason: 'Rental agreement with this number already exists'
    });
    return;
  }

  // Resolve foreign keys
  const property = await db.query(
    'SELECT id FROM properties WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.property_name.toString().trim()]
  );
  if (property.length === 0) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'property_name',
      value: row.property_name,
      message: `Property "${row.property_name}" not found in Properties`
    });
    return;
  }

  // Resolve tenant (required)
  const tenant = await db.query(
    'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
    [tenantId, row.tenant_name.toString().trim()]
  );
  if (tenant.length === 0) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'tenant_name',
      value: row.tenant_name,
      message: `Tenant "${row.tenant_name}" not found in Contacts`
    });
    return;
  }

  let ownerId = null;
  if (row.owner_name && row.owner_name.toString().trim()) {
    const owner = await db.query(
      'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
      [tenantId, row.owner_name.toString().trim()]
    );
    if (owner.length === 0) {
      errors.push({
        sheet: 'RentalAgreements',
        row: excelRow,
        field: 'owner_name',
        value: row.owner_name,
        message: `Owner "${row.owner_name}" not found in Contacts`
      });
      return;
    }
    ownerId = owner[0].id;
  }

  let brokerId = null;
  if (row.broker_name && row.broker_name.toString().trim()) {
    const broker = await db.query(
      'SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
      [tenantId, row.broker_name.toString().trim()]
    );
    if (broker.length === 0) {
      errors.push({
        sheet: 'RentalAgreements',
        row: excelRow,
        field: 'broker_name',
        value: row.broker_name,
        message: `Broker "${row.broker_name}" not found in Contacts`
      });
      return;
    }
    brokerId = broker[0].id;
  }

  // Validate dates
  const startDate = new Date(row.start_date.toString());
  const endDate = new Date(row.end_date.toString());
  if (isNaN(startDate.getTime())) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'start_date',
      value: row.start_date,
      message: 'Invalid start date format'
    });
    return;
  }
  if (isNaN(endDate.getTime())) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'end_date',
      value: row.end_date,
      message: 'Invalid end date format'
    });
    return;
  }
  if (endDate <= startDate) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'end_date',
      value: row.end_date,
      message: 'End date must be after start date'
    });
    return;
  }

  // Validate rent due date (1-31)
  const rentDueDate = parseInt(row.rent_due_date.toString());
  if (isNaN(rentDueDate) || rentDueDate < 1 || rentDueDate > 31) {
    errors.push({
      sheet: 'RentalAgreements',
      row: excelRow,
      field: 'rent_due_date',
      value: row.rent_due_date,
      message: 'Rent due date must be between 1 and 31'
    });
    return;
  }

  validatedData.push({
    agreement_number: row.agreement_number.toString().trim(),
    property_id: property[0].id,
    tenant_id: tenant[0].id, // This will be mapped to contact_id in the database (tenant contact person)
    owner_id: ownerId,
    broker_id: brokerId,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
    monthly_rent: parseFloat(row.monthly_rent.toString()) || 0,
    rent_due_date: rentDueDate,
    status: row.status.toString().trim(),
    security_deposit: row.security_deposit ? parseFloat(row.security_deposit.toString()) || null : null,
    broker_fee: row.broker_fee ? parseFloat(row.broker_fee.toString()) || null : null,
    description: row.description ? row.description.toString().trim() : null
  });
}
