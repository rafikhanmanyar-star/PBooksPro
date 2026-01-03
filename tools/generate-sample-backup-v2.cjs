#!/usr/bin/env node
/**
 * Generate Sample Backup Database
 * 
 * Creates a comprehensive sample database file with demo data for presentations.
 * This includes rental management, project management, investment management,
 * and all related transactions.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Helper function to generate UUID
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Helper function to format date
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Helper function to add days
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Helper function to add months
function addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}

// Helper function to get random element from array
function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Helper function to get random number in range
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to get random float in range
function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// Sample data generators
const firstNames = ['Ahmed', 'Ali', 'Hassan', 'Fatima', 'Ayesha', 'Mohammad', 'Zain', 'Sara', 'Maryam', 'Omar', 'Khalid', 'Layla', 'Noor', 'Ibrahim', 'Yusuf', 'Amina', 'Zara', 'Hamza', 'Bilal', 'Hira'];
const lastNames = ['Khan', 'Ahmed', 'Ali', 'Hassan', 'Malik', 'Sheikh', 'Raza', 'Hussain', 'Iqbal', 'Butt', 'Chaudhry', 'Mirza', 'Abbas', 'Rashid', 'Siddiqui', 'Hashmi', 'Qureshi', 'Shah', 'Baig', 'Ansari'];
const buildingNames = ['Sunset Towers', 'Green Valley Apartments'];
const projectNames = ['Luxury Residency', 'Modern Heights', 'Elite Gardens', 'Royal Estate', 'Grand Plaza', 'Premium Villas', 'Personal Home'];
const vendorNames = ['ABC Construction', 'XYZ Materials', 'Quality Builders', 'Premium Supplies', 'Elite Contractors', 'Best Services', 'Top Builders', 'Master Builders', 'Pro Construction', 'Expert Builders'];
const categoryNames = {
    income: ['Rental Income', 'Sale Income', 'Service Charges', 'Interest Income'],
    expense: ['Construction Materials', 'Labor Costs', 'Electrical Work', 'Plumbing Work', 'Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Doors', 'Windows', 'Roofing', 'Flooring', 'Plumbing Fixtures', 'Electrical Fixtures', 'Project Management Fee']
};

function generateSampleDatabase() {
    console.log('📦 Creating new database...');
    
    // Create temporary database file
    const tempDbPath = path.join(__dirname, '..', 'temp_sample.db');
    if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
    }
    const db = new Database(tempDbPath);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Read and execute schema
    console.log('📋 Creating database schema...');
    const schemaPath = path.join(__dirname, '..', 'services', 'database', 'schema.ts');
    let schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract SQL from the schema file (it's in a template string)
    const schemaMatch = schemaSQL.match(/export const CREATE_SCHEMA_SQL = `([\s\S]*?)`;/);
    if (schemaMatch) {
        schemaSQL = schemaMatch[1];
    } else {
        throw new Error('Could not extract schema SQL');
    }
    
    // Execute schema (split by semicolon and execute each statement)
    const statements = schemaSQL.split(';').filter(s => s.trim().length > 0);
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                db.exec(statement + ';');
            } catch (error) {
                // Some statements might fail (like IF NOT EXISTS on indexes), ignore them
                if (!error.message.includes('already exists')) {
                    console.warn('Schema statement warning:', error.message);
                }
            }
        }
    }
    
    // Set schema version
    const now = new Date().toISOString();
    db.prepare("INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?)").run('schema_version', '1', now);
    
    console.log('✅ Schema created');
    
    // Generate IDs for all entities
    const accountIds = Array.from({ length: 10 }, () => generateId());
    const contactIds = {
        owners: Array.from({ length: 40 }, () => generateId()),
        tenants: Array.from({ length: 40 }, () => generateId()),
        brokers: Array.from({ length: 5 }, () => generateId()),
        vendors: Array.from({ length: 10 }, () => generateId()),
        investors: Array.from({ length: 5 }, () => generateId()),
        familyFriends: Array.from({ length: 15 }, () => generateId())
    };
    const buildingIds = Array.from({ length: 2 }, () => generateId());
    const propertyIds = Array.from({ length: 40 }, () => generateId());
    const projectIds = Array.from({ length: 7 }, () => generateId());
    const categoryIds = {
        income: Array.from({ length: 4 }, () => generateId()),
        expense: Array.from({ length: 17 }, () => generateId())
    };
    
    // Prepare statements for better performance
    const insertAccount = db.prepare("INSERT INTO accounts (id, name, type, balance, is_permanent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertCategory = db.prepare("INSERT INTO categories (id, name, type, is_permanent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertContact = db.prepare("INSERT INTO contacts (id, name, type, contact_no, address, company_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertBuilding = db.prepare("INSERT INTO buildings (id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertProperty = db.prepare("INSERT INTO properties (id, name, owner_id, building_id, description, monthly_service_charge, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertProject = db.prepare("INSERT INTO projects (id, name, description, color, status, pm_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertUnit = db.prepare("INSERT INTO units (id, name, project_id, contact_id, sale_price, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertRentalAgreement = db.prepare("INSERT INTO rental_agreements (id, agreement_number, tenant_id, property_id, start_date, end_date, monthly_rent, rent_due_date, status, security_deposit, broker_id, broker_fee, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertProjectAgreement = db.prepare("INSERT INTO project_agreements (id, agreement_number, client_id, project_id, list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price, rebate_amount, rebate_broker_id, issue_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertProjectAgreementUnit = db.prepare("INSERT INTO project_agreement_units (agreement_id, unit_id) VALUES (?, ?)");
    const insertContract = db.prepare("INSERT INTO contracts (id, contract_number, name, project_id, vendor_id, total_amount, start_date, end_date, status, expense_category_items, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertQuotation = db.prepare("INSERT INTO quotations (id, vendor_id, name, date, items, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertInvoice = db.prepare("INSERT INTO invoices (id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, building_id, category_id, agreement_id, rental_month, project_id, unit_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertBill = db.prepare("INSERT INTO bills (id, bill_number, contact_id, amount, paid_amount, status, issue_date, due_date, category_id, project_id, contract_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertTransaction = db.prepare("INSERT INTO transactions (id, type, subtype, amount, date, description, account_id, from_account_id, to_account_id, category_id, contact_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, agreement_id, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertAppSetting = db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)");
    
    // Create accounts
    console.log('💰 Creating accounts...');
    const accountNames = ['Main Bank Account', 'Cash Account', 'Savings Account', 'Investment Account 1', 'Investment Account 2', 'Project Account 1', 'Project Account 2', 'Rental Account', 'Owner Payout Account', 'Broker Commission Account'];
    const accountTypes = ['Bank', 'Cash', 'Bank', 'Bank', 'Bank', 'Bank', 'Bank', 'Bank', 'Bank', 'Bank'];
    
    accountNames.forEach((name, index) => {
        const balance = randomFloat(100000, 5000000);
        insertAccount.run(accountIds[index], name, accountTypes[index], balance, index < 3 ? 1 : 0, now, now);
    });
    
    // Create categories
    console.log('📁 Creating categories...');
    categoryNames.income.forEach((name, index) => {
        insertCategory.run(categoryIds.income[index], name, 'Income', 1, now, now);
    });
    
    categoryNames.expense.forEach((name, index) => {
        insertCategory.run(categoryIds.expense[index], name, 'Expense', 1, now, now);
    });
    
    // Create contacts - Owners
    console.log('👥 Creating owners...');
    contactIds.owners.forEach((id, index) => {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const name = `${firstName} ${lastName}`;
        insertContact.run(id, name, 'Owner', `+92-300-${randomInt(1000000, 9999999)}`, `${randomInt(1, 100)} Street ${randomInt(1, 50)}, City`, null, now, now);
    });
    
    // Create contacts - Tenants
    console.log('👥 Creating tenants...');
    contactIds.tenants.forEach((id, index) => {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const name = `${firstName} ${lastName}`;
        insertContact.run(id, name, 'Tenant', `+92-300-${randomInt(1000000, 9999999)}`, `${randomInt(1, 100)} Street ${randomInt(1, 50)}, City`, null, now, now);
    });
    
    // Create contacts - Brokers
    console.log('👥 Creating brokers...');
    contactIds.brokers.forEach((id, index) => {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const name = `${firstName} ${lastName}`;
        insertContact.run(id, name, 'Broker', `+92-300-${randomInt(1000000, 9999999)}`, null, `${name} Real Estate`, now, now);
    });
    
    // Create contacts - Vendors
    console.log('👥 Creating vendors...');
    contactIds.vendors.forEach((id, index) => {
        const name = vendorNames[index] || `Vendor ${index + 1}`;
        insertContact.run(id, name, 'Vendor', `+92-300-${randomInt(1000000, 9999999)}`, `${randomInt(1, 100)} Industrial Area, City`, name, now, now);
    });
    
    // Create contacts - Investors
    console.log('👥 Creating investors...');
    contactIds.investors.forEach((id, index) => {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const name = `${firstName} ${lastName}`;
        insertContact.run(id, name, 'Client', `+92-300-${randomInt(1000000, 9999999)}`, `${randomInt(1, 100)} Street ${randomInt(1, 50)}, City`, null, now, now);
    });
    
    // Create contacts - Family & Friends
    console.log('👥 Creating family & friends...');
    contactIds.familyFriends.forEach((id, index) => {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const name = `${firstName} ${lastName}`;
        insertContact.run(id, name, 'Friend & Family', `+92-300-${randomInt(1000000, 9999999)}`, `${randomInt(1, 100)} Street ${randomInt(1, 50)}, City`, null, now, now);
    });
    
    // Create buildings
    console.log('🏢 Creating buildings...');
    buildingNames.forEach((name, index) => {
        insertBuilding.run(buildingIds[index], name, `${name} - Residential Complex`, `#${Math.floor(Math.random()*16777215).toString(16)}`, now, now);
    });
    
    // Create properties (20 per building)
    console.log('🏠 Creating properties...');
    let propertyIndex = 0;
    buildingIds.forEach((buildingId, buildingIndex) => {
        for (let i = 0; i < 20; i++) {
            const ownerId = contactIds.owners[propertyIndex % 40];
            const propertyName = `${buildingNames[buildingIndex]} - Unit ${String(i + 1).padStart(2, '0')}`;
            insertProperty.run(propertyIds[propertyIndex], propertyName, ownerId, buildingId, `Unit ${i + 1} in ${buildingNames[buildingIndex]}`, randomFloat(2000, 10000), now, now);
            propertyIndex++;
        }
    });
    
    // Create projects
    console.log('🏗️ Creating projects...');
    const projectStatuses = ['Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Active'];
    projectNames.forEach((name, index) => {
        const isPersonal = index === 6; // Last project is personal
        const pmConfig = JSON.stringify({
            rate: 15,
            frequency: 'Monthly',
            lastCalculationDate: formatDate(addMonths(new Date(), -1))
        });
        insertProject.run(projectIds[index], name, `${name} - ${isPersonal ? 'Personal' : 'Commercial'} Project`, `#${Math.floor(Math.random()*16777215).toString(16)}`, projectStatuses[index], pmConfig, now, now);
    });
    
    // Create units for projects
    console.log('🏘️ Creating units...');
    const unitIds = [];
    let unitIndex = 0;
    projectIds.forEach((projectId, projectIndex) => {
        const unitsPerProject = randomInt(10, 30);
        for (let i = 0; i < unitsPerProject; i++) {
            const unitId = generateId();
            unitIds.push(unitId);
            const unitName = `Unit ${String(i + 1).padStart(2, '0')}`;
            const salePrice = randomFloat(5000000, 25000000);
            const contactId = Math.random() > 0.5 ? contactIds.investors[randomInt(0, 4)] : null;
            insertUnit.run(unitId, unitName, projectId, contactId, salePrice, `${unitName} in ${projectNames[projectIndex]}`, now, now);
            unitIndex++;
        }
    });
    
    // Create rental agreements
    console.log('📄 Creating rental agreements...');
    const rentalAgreementIds = [];
    let agreementNumber = 1;
    propertyIds.forEach((propertyId, index) => {
        if (Math.random() > 0.3) { // 70% of properties have agreements
            const agreementId = generateId();
            rentalAgreementIds.push(agreementId);
            const tenantId = contactIds.tenants[index % 40];
            const startDate = addMonths(new Date(), -randomInt(1, 24));
            const endDate = addMonths(startDate, 12);
            const monthlyRent = randomFloat(30000, 150000);
            const brokerId = Math.random() > 0.5 ? randomElement(contactIds.brokers) : null;
            const brokerFee = brokerId ? monthlyRent * 0.5 : null;
            
            insertRentalAgreement.run(agreementId, `AGR-${String(agreementNumber++).padStart(4, '0')}`, tenantId, propertyId, formatDate(startDate), formatDate(endDate), monthlyRent, randomInt(1, 5), 'Active', monthlyRent * 2, brokerId, brokerFee, now, now);
        }
    });
    
    // Create project agreements
    console.log('📄 Creating project agreements...');
    const projectAgreementIds = [];
    let projectAgreementNumber = 1;
    let unitOffset = 0;
    projectIds.forEach((projectId, projectIndex) => {
        const agreementsPerProject = randomInt(5, 15);
        const projectUnits = unitIds.slice(unitOffset, unitOffset + (projectIndex === 0 ? randomInt(10, 30) : (projectIndex < 6 ? randomInt(10, 30) : randomInt(10, 30))));
        unitOffset += projectUnits.length;
        
        for (let i = 0; i < agreementsPerProject; i++) {
            const agreementId = generateId();
            projectAgreementIds.push(agreementId);
            const clientId = contactIds.investors[randomInt(0, 4)];
            const unitId = projectUnits[i % projectUnits.length] || unitIds[Math.floor(Math.random() * unitIds.length)];
            
            const listPrice = randomFloat(5000000, 25000000);
            const customerDiscount = randomFloat(0, listPrice * 0.1);
            const floorDiscount = randomFloat(0, listPrice * 0.05);
            const lumpSumDiscount = randomFloat(0, listPrice * 0.1);
            const miscDiscount = randomFloat(0, listPrice * 0.02);
            const sellingPrice = listPrice - customerDiscount - floorDiscount - lumpSumDiscount - miscDiscount;
            const rebateAmount = Math.random() > 0.7 ? randomFloat(0, sellingPrice * 0.05) : null;
            const rebateBrokerId = rebateAmount ? randomElement(contactIds.brokers) : null;
            
            insertProjectAgreement.run(agreementId, `P-AGR-${String(projectAgreementNumber++).padStart(4, '0')}`, clientId, projectId, listPrice, customerDiscount, floorDiscount, lumpSumDiscount, miscDiscount, sellingPrice, rebateAmount, rebateBrokerId, formatDate(addMonths(new Date(), -randomInt(1, 12))), 'Active', now, now);
            
            // Link unit to agreement
            insertProjectAgreementUnit.run(agreementId, unitId);
        }
    });
    
    // Create contracts
    console.log('📋 Creating contracts...');
    const contractIds = [];
    let contractNumber = 1;
    projectIds.forEach((projectId) => {
        const contractsPerProject = randomInt(3, 8);
        for (let i = 0; i < contractsPerProject; i++) {
            const contractId = generateId();
            contractIds.push(contractId);
            const vendorId = randomElement(contactIds.vendors);
            const totalAmount = randomFloat(500000, 5000000);
            const startDate = addMonths(new Date(), -randomInt(1, 12));
            const endDate = addMonths(startDate, randomInt(3, 12));
            
            // Create expense category items
            const expenseItems = [];
            const numItems = randomInt(2, 5);
            for (let j = 0; j < numItems; j++) {
                const categoryId = randomElement(categoryIds.expense);
                const quantity = randomFloat(10, 1000);
                const pricePerUnit = randomFloat(100, 5000);
                expenseItems.push({
                    id: generateId(),
                    categoryId: categoryId,
                    unit: randomElement(['Square feet', 'Cubic Feet', 'feet', 'quantity']),
                    quantity: quantity,
                    pricePerUnit: pricePerUnit,
                    netValue: quantity * pricePerUnit
                });
            }
            
            insertContract.run(contractId, `CNT-${String(contractNumber++).padStart(4, '0')}`, `Contract ${contractNumber - 1}`, projectId, vendorId, totalAmount, formatDate(startDate), formatDate(endDate), 'Active', JSON.stringify(expenseItems), `Contract for ${projectNames[projectIds.indexOf(projectId)]}`, now, now);
        }
    });
    
    // Create quotations
    console.log('📝 Creating quotations...');
    const quotationIds = [];
    projectIds.forEach((projectId) => {
        const quotationsPerProject = randomInt(2, 5);
        for (let i = 0; i < quotationsPerProject; i++) {
            const quotationId = generateId();
            quotationIds.push(quotationId);
            const vendorId = randomElement(contactIds.vendors);
            const numItems = randomInt(3, 8);
            const items = [];
            let totalAmount = 0;
            
            for (let j = 0; j < numItems; j++) {
                const item = {
                    id: generateId(),
                    categoryId: randomElement(categoryIds.expense),
                    quantity: randomFloat(1, 100),
                    pricePerQuantity: randomFloat(100, 10000),
                    unit: randomElement(['sq ft', 'numbers', 'meters', 'liters'])
                };
                items.push(item);
                totalAmount += item.quantity * item.pricePerQuantity;
            }
            
            insertQuotation.run(quotationId, vendorId, `Quotation from ${vendorId}`, formatDate(addMonths(new Date(), -randomInt(1, 6))), JSON.stringify(items), totalAmount, now, now);
        }
    });
    
    // Create invoices (rental and project)
    console.log('🧾 Creating invoices...');
    const invoiceIds = [];
    let invoiceNumber = 1;
    let projectInvoiceNumber = 1;
    
    // Rental invoices
    rentalAgreementIds.forEach((agreementId, index) => {
        const propertyId = propertyIds[index % propertyIds.length];
        const monthlyRent = randomFloat(30000, 150000);
        // Create invoices for last 12 months
        for (let month = 0; month < 12; month++) {
            const invoiceId = generateId();
            invoiceIds.push(invoiceId);
            const invoiceDate = addMonths(new Date(), -month);
            const amount = monthlyRent;
            const paidAmount = Math.random() > 0.3 ? amount : (Math.random() > 0.5 ? amount * randomFloat(0.5, 0.9) : 0);
            const status = paidAmount === 0 ? 'Unpaid' : (paidAmount === amount ? 'Paid' : 'Partially Paid');
            
            insertInvoice.run(invoiceId, `INV-${String(invoiceNumber++).padStart(5, '0')}`, contactIds.tenants[index % 40], amount, paidAmount, status, formatDate(invoiceDate), formatDate(addDays(invoiceDate, 7)), 'Rental', propertyId, buildingIds[Math.floor(index / 20)], categoryIds.income[0], agreementId, formatDate(invoiceDate), null, null, now, now);
        }
    });
    
    // Project invoices
    projectAgreementIds.forEach((agreementId, index) => {
        const sellingPrice = randomFloat(5000000, 25000000);
        // Create installment invoices
        const numInstallments = randomInt(6, 24);
        const installmentAmount = sellingPrice / numInstallments;
        for (let i = 0; i < numInstallments; i++) {
            const invoiceId = generateId();
            invoiceIds.push(invoiceId);
            const invoiceDate = addMonths(new Date(), -randomInt(0, 12));
            const paidAmount = Math.random() > 0.4 ? installmentAmount : (Math.random() > 0.6 ? installmentAmount * randomFloat(0.3, 0.8) : 0);
            const status = paidAmount === 0 ? 'Unpaid' : (paidAmount === installmentAmount ? 'Paid' : 'Partially Paid');
            const projectId = projectIds[Math.floor(index / 10) % 7];
            
            insertInvoice.run(invoiceId, `P-INV-${String(projectInvoiceNumber++).padStart(5, '0')}`, contactIds.investors[randomInt(0, 4)], installmentAmount, paidAmount, status, formatDate(invoiceDate), formatDate(addDays(invoiceDate, 30)), 'Installment', null, null, categoryIds.income[1], agreementId, null, projectId, null, now, now);
        }
    });
    
    // Create bills
    console.log('💳 Creating bills...');
    const billIds = [];
    let billNumber = 1;
    
    // Bills for projects
    projectIds.forEach((projectId, projectIndex) => {
        const billsPerProject = randomInt(10, 30);
        for (let i = 0; i < billsPerProject; i++) {
            const billId = generateId();
            billIds.push(billId);
            const vendorId = randomElement(contactIds.vendors);
            const amount = randomFloat(10000, 500000);
            const paidAmount = Math.random() > 0.3 ? amount : (Math.random() > 0.5 ? amount * randomFloat(0.4, 0.9) : 0);
            const status = paidAmount === 0 ? 'Unpaid' : (paidAmount === amount ? 'Paid' : 'Partially Paid');
            const billDate = addMonths(new Date(), -randomInt(0, 12));
            const contractId = Math.random() > 0.5 ? randomElement(contractIds) : null;
            
            insertBill.run(billId, `BILL-${String(billNumber++).padStart(5, '0')}`, vendorId, amount, paidAmount, status, formatDate(billDate), formatDate(addDays(billDate, 30)), randomElement(categoryIds.expense), projectId, contractId, now, now);
        }
    });
    
    // Create transactions (around 2000 total)
    console.log('💸 Creating transactions...');
    const transactionIds = [];
    let transactionCount = 0;
    const targetTransactions = 2000;
    
    // Rental income transactions
    invoiceIds.forEach((invoiceId, index) => {
        if (index < rentalAgreementIds.length * 12 && Math.random() > 0.3) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const paidAmount = randomFloat(30000, 150000);
            if (paidAmount > 0) {
                const transactionDate = addMonths(new Date(), -randomInt(0, 12));
                insertTransaction.run(transactionId, 'Income', null, paidAmount, formatDate(transactionDate), `Rental payment for invoice`, accountIds[0], null, null, categoryIds.income[0], contactIds.tenants[index % 40], null, buildingIds[Math.floor((index % 40) / 20)], propertyIds[index % 40], null, invoiceId, null, null, 0, now, now);
                transactionCount++;
            }
        }
    });
    
    // Project income transactions
    invoiceIds.forEach((invoiceId, index) => {
        if (index >= rentalAgreementIds.length * 12 && Math.random() > 0.4 && transactionCount < targetTransactions) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const paidAmount = randomFloat(200000, 2000000);
            if (paidAmount > 0) {
                const transactionDate = addMonths(new Date(), -randomInt(0, 12));
                const projectIndex = Math.floor((index - rentalAgreementIds.length * 12) / 10);
                insertTransaction.run(transactionId, 'Income', null, paidAmount, formatDate(transactionDate), `Installment payment`, accountIds[0], null, null, categoryIds.income[1], contactIds.investors[randomInt(0, 4)], projectIds[projectIndex % 7], null, null, null, invoiceId, null, null, 0, now, now);
                transactionCount++;
            }
        }
    });
    
    // Bill payment transactions
    billIds.forEach((billId, index) => {
        if (Math.random() > 0.3 && transactionCount < targetTransactions) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const paidAmount = randomFloat(10000, 500000);
            if (paidAmount > 0) {
                const transactionDate = addMonths(new Date(), -randomInt(0, 12));
                const projectIndex = Math.floor(index / 20);
                insertTransaction.run(transactionId, 'Expense', null, paidAmount, formatDate(transactionDate), `Bill payment`, accountIds[0], null, null, randomElement(categoryIds.expense), randomElement(contactIds.vendors), projectIds[projectIndex % 7], null, null, null, null, billId, null, 0, now, now);
                transactionCount++;
            }
        }
    });
    
    // Owner payout transactions
    contactIds.owners.forEach((ownerId, index) => {
        if (Math.random() > 0.5 && transactionCount < targetTransactions) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const payoutAmount = randomFloat(50000, 500000);
            const transactionDate = addMonths(new Date(), -randomInt(0, 6));
            insertTransaction.run(transactionId, 'Expense', null, payoutAmount, formatDate(transactionDate), `Owner payout for property`, accountIds[8], null, null, categoryIds.expense[0], ownerId, null, null, propertyIds[index], null, null, null, null, 0, now, now);
            transactionCount++;
        }
    });
    
    // Broker commission transactions
    contactIds.brokers.forEach((brokerId) => {
        if (Math.random() > 0.5 && transactionCount < targetTransactions) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const commissionAmount = randomFloat(50000, 500000);
            const transactionDate = addMonths(new Date(), -randomInt(0, 6));
            insertTransaction.run(transactionId, 'Expense', null, commissionAmount, formatDate(transactionDate), `Broker commission`, accountIds[9], null, null, categoryIds.expense[0], brokerId, null, null, null, null, null, null, null, 0, now, now);
            transactionCount++;
        }
    });
    
    // Project Management cost transactions (15% of project expenses)
    projectIds.forEach((projectId, projectIndex) => {
        // Calculate PM cost based on project expenses
        const projectBills = billIds.filter((_, idx) => Math.floor(idx / 20) === projectIndex);
        const totalProjectExpenses = projectBills.length * randomFloat(100000, 500000); // Approximate
        const pmCost = totalProjectExpenses * 0.15;
        
        if (pmCost > 0 && transactionCount < targetTransactions) {
            // Create monthly PM cost transactions
            for (let month = 0; month < 12; month++) {
                const transactionId = generateId();
                transactionIds.push(transactionId);
                const monthlyPmCost = pmCost / 12;
                const transactionDate = addMonths(new Date(), -month);
                insertTransaction.run(transactionId, 'Expense', null, monthlyPmCost, formatDate(transactionDate), `Project Management Fee (15%)`, accountIds[0], null, null, categoryIds.expense[16], null, projectId, null, null, null, null, null, null, 1, now, now);
                transactionCount++;
            }
        }
    });
    
    // Investment transactions (loans and transfers)
    contactIds.investors.forEach((investorId) => {
        // Investment in each project
        projectIds.forEach((projectId) => {
            if (Math.random() > 0.3 && transactionCount < targetTransactions) {
                const transactionId = generateId();
                transactionIds.push(transactionId);
                const investmentAmount = randomFloat(1000000, 10000000);
                const transactionDate = addMonths(new Date(), -randomInt(0, 12));
                insertTransaction.run(transactionId, 'Income', null, investmentAmount, formatDate(transactionDate), `Investment from investor`, accountIds[3], null, null, categoryIds.income[1], investorId, projectId, null, null, null, null, null, null, 0, now, now);
                transactionCount++;
            }
        });
        
        // Loan transactions
        if (Math.random() > 0.5 && transactionCount < targetTransactions) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const loanAmount = randomFloat(500000, 5000000);
            const transactionDate = addMonths(new Date(), -randomInt(0, 6));
            const loanType = Math.random() > 0.5 ? 'Give Loan' : 'Receive Loan';
            insertTransaction.run(transactionId, 'Loan', loanType, loanAmount, formatDate(transactionDate), `${loanType} transaction`, accountIds[0], null, null, categoryIds.expense[0], investorId, null, null, null, null, null, null, null, 0, now, now);
            transactionCount++;
        }
        
        // Transfer transactions
        if (Math.random() > 0.6 && transactionCount < targetTransactions) {
            const transactionId = generateId();
            transactionIds.push(transactionId);
            const transferAmount = randomFloat(100000, 2000000);
            const transactionDate = addMonths(new Date(), -randomInt(0, 6));
            const fromAccount = randomElement(accountIds);
            const toAccount = randomElement(accountIds.filter(id => id !== fromAccount));
            insertTransaction.run(transactionId, 'Transfer', null, transferAmount, formatDate(transactionDate), `Transfer between accounts`, fromAccount, fromAccount, toAccount, null, null, null, null, null, null, null, null, null, 0, now, now);
            transactionCount++;
        }
    });
    
    // Fill remaining transactions to reach ~2000
    while (transactionCount < targetTransactions) {
        const transactionId = generateId();
        transactionIds.push(transactionId);
        const transactionType = randomElement(['Income', 'Expense', 'Transfer']);
        const amount = randomFloat(1000, 1000000);
        const transactionDate = addMonths(new Date(), -randomInt(0, 12));
        const accountId = randomElement(accountIds);
        const categoryId = transactionType === 'Income' ? randomElement(categoryIds.income) : randomElement(categoryIds.expense);
        const contactId = Math.random() > 0.5 ? randomElement([...contactIds.owners, ...contactIds.tenants, ...contactIds.vendors, ...contactIds.investors]) : null;
        const projectId = Math.random() > 0.5 ? randomElement(projectIds) : null;
        
        if (transactionType === 'Transfer') {
            const fromAccount = accountId;
            const toAccount = randomElement(accountIds.filter(id => id !== fromAccount));
            insertTransaction.run(transactionId, transactionType, null, amount, formatDate(transactionDate), `Transfer transaction`, fromAccount, fromAccount, toAccount, null, null, null, null, null, null, null, null, null, 0, now, now);
        } else {
            insertTransaction.run(transactionId, transactionType, null, amount, formatDate(transactionDate), `${transactionType} transaction`, accountId, null, null, categoryId, contactId, projectId, null, null, null, null, null, null, 0, now, now);
        }
        transactionCount++;
    }
    
    // Create app settings
    console.log('⚙️ Creating application settings...');
    const settings = {
        agreementSettings: { prefix: 'AGR-', nextNumber: agreementNumber, padding: 4 },
        projectAgreementSettings: { prefix: 'P-AGR-', nextNumber: projectAgreementNumber, padding: 4 },
        rentalInvoiceSettings: { prefix: 'INV-', nextNumber: invoiceNumber, padding: 5 },
        projectInvoiceSettings: { prefix: 'P-INV-', nextNumber: projectInvoiceNumber, padding: 5 },
        printSettings: {
            companyName: 'PBooksPro',
            companyAddress: '123 Business Street, City, Country',
            companyContact: '+92-300-1234567',
            showLogo: true,
            showDatePrinted: true
        },
        whatsAppTemplates: {
            invoiceReminder: 'Dear {contactName}, Invoice #{invoiceNumber} for {subject} is due on {dueDate}. Amount: {amount}.',
            invoiceReceipt: 'Dear {contactName}, Payment of {paidAmount} received for Invoice #{invoiceNumber}. Balance: {balance}.',
            billPayment: 'Dear {contactName}, Bill #{billNumber} has been paid. Amount: {paidAmount}.',
            vendorGreeting: 'Hello {contactName},'
        },
        dashboardConfig: { visibleKpis: [] },
        showSystemTransactions: false,
        enableColorCoding: true,
        enableBeepOnSave: false,
        pmCostPercentage: 15
    };
    
    Object.entries(settings).forEach(([key, value]) => {
        insertAppSetting.run(key, JSON.stringify(value), now);
    });
    
    // Set metadata
    db.prepare("INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?)").run('sample_data', 'true', now);
    
    console.log('✅ Sample data created');
    console.log(`📊 Statistics:`);
    console.log(`   - Accounts: ${accountIds.length}`);
    console.log(`   - Contacts: ${Object.values(contactIds).flat().length}`);
    console.log(`   - Buildings: ${buildingIds.length}`);
    console.log(`   - Properties: ${propertyIds.length}`);
    console.log(`   - Projects: ${projectIds.length}`);
    console.log(`   - Units: ${unitIds.length}`);
    console.log(`   - Rental Agreements: ${rentalAgreementIds.length}`);
    console.log(`   - Project Agreements: ${projectAgreementIds.length}`);
    console.log(`   - Contracts: ${contractIds.length}`);
    console.log(`   - Quotations: ${quotationIds.length}`);
    console.log(`   - Invoices: ${invoiceIds.length}`);
    console.log(`   - Bills: ${billIds.length}`);
    console.log(`   - Transactions: ${transactionCount}`);
    
    // Close database and copy to final location
    console.log('💾 Finalizing database...');
    db.close();
    
    const outputPath = path.join(__dirname, '..', 'finance-tracker-Sample data.db');
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }
    fs.copyFileSync(tempDbPath, outputPath);
    fs.unlinkSync(tempDbPath);
    
    const stats = fs.statSync(outputPath);
    console.log(`✅ Sample backup database created: ${outputPath}`);
    console.log(`📁 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

// Run the script
try {
    generateSampleDatabase();
    console.log('✅ Script completed successfully!');
    process.exit(0);
} catch (error) {
    console.error('❌ Error generating sample database:', error);
    process.exit(1);
}

