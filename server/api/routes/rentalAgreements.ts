import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();
let tenantColumnInfoCache: { hasOrgId: boolean; hasTenantId: boolean } | null = null;

async function getTenantColumnInfo() {
  if (tenantColumnInfoCache) return tenantColumnInfoCache;
  const db = getDb();
  const columns = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'rental_agreements'
       AND column_name IN ('org_id', 'tenant_id')`
  );
  const columnNames = new Set(columns.map((col: any) => col.column_name));
  tenantColumnInfoCache = {
    hasOrgId: columnNames.has('org_id'),
    hasTenantId: columnNames.has('tenant_id')
  };
  return tenantColumnInfoCache;
}

function buildTenantClause(info: { hasOrgId: boolean; hasTenantId: boolean }, index: number) {
  if (info.hasOrgId && info.hasTenantId) {
    return `(org_id = $${index} OR tenant_id = $${index})`;
  }
  if (info.hasOrgId) {
    return `org_id = $${index}`;
  }
  return `tenant_id = $${index}`;
}

/**
 * Transform database result (snake_case) to API response format (camelCase)
 */
function transformRentalAgreement(dbResult: any): any {
  if (!dbResult) return dbResult;

  return {
    id: dbResult.id,
    agreementNumber: dbResult.agreement_number || dbResult.agreementNumber,
    contactId: dbResult.contact_id || dbResult.contactId, // Contact ID (the tenant contact person)
    propertyId: dbResult.property_id || dbResult.propertyId,
    startDate: dbResult.start_date || dbResult.startDate,
    endDate: dbResult.end_date || dbResult.endDate,
    monthlyRent: dbResult.monthly_rent !== undefined ? dbResult.monthly_rent : dbResult.monthlyRent,
    rentDueDate: dbResult.rent_due_date !== undefined ? dbResult.rent_due_date : dbResult.rentDueDate,
    status: dbResult.status,
    description: dbResult.description,
    securityDeposit: dbResult.security_deposit !== undefined ? dbResult.security_deposit : dbResult.securityDeposit,
    brokerId: dbResult.broker_id || dbResult.brokerId,
    brokerFee: dbResult.broker_fee !== undefined ? dbResult.broker_fee : dbResult.brokerFee,
    ownerId: dbResult.owner_id || dbResult.ownerId,
    previousAgreementId: dbResult.previous_agreement_id || dbResult.previousAgreementId || null,
    orgId: dbResult.org_id || dbResult.orgId,
    userId: dbResult.user_id || dbResult.userId,
    createdAt: dbResult.created_at || dbResult.createdAt,
    updatedAt: dbResult.updated_at || dbResult.updatedAt
  };
}

// GET all rental agreements
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, propertyId } = req.query;

    const tenantInfo = await getTenantColumnInfo();
    let query = `SELECT * FROM rental_agreements WHERE ${buildTenantClause(tenantInfo, 1)} AND deleted_at IS NULL`;
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (propertyId) {
      query += ` AND property_id = $${paramIndex++}`;
      params.push(propertyId);
    }

    query += ' ORDER BY start_date DESC';

    // Log query for debugging (remove in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Rental Agreements] Query:', query);
      console.log('[Rental Agreements] Params:', params);
    }

    const agreements = await db.query(query, params);
    // Transform database results to camelCase for API response
    const transformedAgreements = agreements.map(transformRentalAgreement);
    res.json(transformedAgreements);
  } catch (error: any) {
    console.error('Error fetching rental agreements:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      query: 'SELECT * FROM rental_agreements WHERE org_id = $1',
      tenantId: req.tenantId
    });
    res.status(500).json({
      error: 'Failed to fetch rental agreements',
      message: error?.message || 'Unknown error',
      code: error?.code
    });
  }
});

// GET rental agreement by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantInfo = await getTenantColumnInfo();
    const agreements = await db.query(
      `SELECT * FROM rental_agreements WHERE id = $1 AND ${buildTenantClause(tenantInfo, 2)}`,
      [req.params.id, req.tenantId]
    );

    if (agreements.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }

    // Transform database result to camelCase for API response
    res.json(transformRentalAgreement(agreements[0]));
  } catch (error) {
    console.error('Error fetching rental agreement:', error);
    res.status(500).json({ error: 'Failed to fetch rental agreement' });
  }
});

// POST create/update rental agreement (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreement = req.body;
    const tenantInfo = await getTenantColumnInfo();

    console.log('📝 POST /rental-agreements - Received request:', {
      tenantId: req.tenantId,
      userId: req.user?.userId,
      agreementId: agreement.id,
      agreementNumber: agreement.agreementNumber,
      contactId: agreement.contactId,
      propertyId: agreement.propertyId,
      startDate: agreement.startDate,
      endDate: agreement.endDate,
      monthlyRent: agreement.monthlyRent,
      rentDueDate: agreement.rentDueDate,
      status: agreement.status,
      hasBody: !!agreement,
      bodyKeys: Object.keys(agreement || {})
    });

    // Validate required fields
    if (!agreement.agreementNumber) {
      console.log('❌ POST /rental-agreements - Validation failed: agreementNumber is required');
      return res.status(400).json({
        error: 'Validation error',
        message: 'Agreement number is required'
      });
    }

    // Generate ID if not provided
    const agreementId = agreement.id || `rental_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if agreement with this ID already exists and belongs to a different tenant
    if (agreement.id) {
      const tenantColumns = [
        tenantInfo.hasOrgId ? 'org_id' : null,
        tenantInfo.hasTenantId ? 'tenant_id' : null
      ].filter(Boolean);
      const selectTenantColumns = tenantColumns.length > 0 ? `, ${tenantColumns.join(', ')}` : '';
      const existingAgreement = await db.query(
        `SELECT id${selectTenantColumns} FROM rental_agreements WHERE id = $1`,
        [agreementId]
      );

      const existingRow = existingAgreement[0];
      const existingTenantId = existingRow?.org_id ?? existingRow?.tenant_id;
      if (existingAgreement.length > 0 && existingTenantId !== req.tenantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A rental agreement with this ID already exists in another organization'
        });
      }
    }

    // Check if agreement exists to determine if this is a create or update
    const existing = await db.query(
      `SELECT id, status, version FROM rental_agreements WHERE id = $1 AND ${buildTenantClause(tenantInfo, 2)}`,
      [agreementId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // If updating, check if invoices exist and if status is not Renewed
    if (isUpdate) {
      const existingAgreement = existing[0];
      const hasInvoices = await db.query(
        'SELECT COUNT(*) as count FROM invoices WHERE agreement_id = $1 AND tenant_id = $2',
        [agreementId, req.tenantId]
      );

      const invoiceCount = parseInt(hasInvoices[0]?.count || '0', 10);
      const isChangingStatusToRenewed = agreement.status === 'Renewed' && existingAgreement.status !== 'Renewed';

      if (invoiceCount > 0 && existingAgreement.status !== 'Renewed') {
        // Only allow changing status to Renewed, prevent other field changes
        if (isChangingStatusToRenewed) {
          // Allow only status update, preserve all other fields from existing agreement
          const result = await db.query(
            `UPDATE rental_agreements 
             SET status = $1, updated_at = NOW(),
                 version = COALESCE(version, 1) + 1
             WHERE id = $2 AND ${buildTenantClause(tenantInfo, 3)}
             RETURNING *`,
            ['Renewed', agreementId, req.tenantId]
          );

          if (result.length === 0) {
            return res.status(404).json({ error: 'Rental agreement not found' });
          }

          const transformedResult = transformRentalAgreement(result[0]);
          emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
            agreement: transformedResult,
            userId: req.user?.userId,
            username: req.user?.username,
          });

          return res.status(200).json(transformedResult);
        } else {
          return res.status(400).json({
            error: 'Cannot edit agreement',
            message: 'This agreement has invoices associated with it. To modify the agreement, you must first change its status to "Renewed".'
          });
        }
      }
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const insertColumns = ['id'];
    const insertValues: any[] = [agreementId];

    if (tenantInfo.hasOrgId) {
      insertColumns.push('org_id');
      insertValues.push(req.tenantId);
    }
    if (tenantInfo.hasTenantId) {
      insertColumns.push('tenant_id');
      insertValues.push(req.tenantId);
    }

    insertColumns.push(
      'agreement_number',
      'contact_id',
      'property_id',
      'start_date',
      'end_date',
      'monthly_rent',
      'rent_due_date',
      'status',
      'description',
      'security_deposit',
      'broker_id',
      'broker_fee',
      'owner_id',
      'previous_agreement_id',
      'created_at',
      'updated_at',
      'version'
    );

    insertValues.push(
      agreement.agreementNumber,
      agreement.contactId || null, // Contact ID (the tenant contact person)
      agreement.propertyId,
      agreement.startDate,
      agreement.endDate,
      agreement.monthlyRent,
      agreement.rentDueDate,
      agreement.status,
      agreement.description || null,
      agreement.securityDeposit || null,
      agreement.brokerId || null,
      agreement.brokerFee || null,
      agreement.ownerId || null,
      agreement.previousAgreementId || null
    );

    const valuePlaceholders = insertColumns.map((_, idx) => `$${idx + 1}`);
    // Indices for special handling
    const createdAtIdx = insertColumns.indexOf('created_at');
    const updatedAtIdx = insertColumns.indexOf('updated_at');
    const versionIdx = insertColumns.indexOf('version');

    if (createdAtIdx !== -1) {
      valuePlaceholders[createdAtIdx] = `COALESCE((SELECT created_at FROM rental_agreements WHERE id = $1), NOW())`;
    }
    if (updatedAtIdx !== -1) {
      valuePlaceholders[updatedAtIdx] = `NOW()`;
    }
    if (versionIdx !== -1) {
      valuePlaceholders[versionIdx] = `1`;
    }

    // Build version-safe WHERE clause for ON CONFLICT UPDATE:
    // When serverVersion is null (new agreement or first sync), skip the version check
    // to avoid SQL NULL comparison issues (NULL = NULL is UNKNOWN, not TRUE)
    const versionWhereClause = serverVersion != null
      ? `AND (rental_agreements.version = $${insertValues.length + 1} OR rental_agreements.version IS NULL)`
      : '';

    const upsertParams = serverVersion != null
      ? [...insertValues, serverVersion]
      : insertValues;

    const result = await db.query(
      `INSERT INTO rental_agreements (
        ${insertColumns.join(', ')}
      ) VALUES (${valuePlaceholders.join(', ')})
      ON CONFLICT (id) 
      DO UPDATE SET
        agreement_number = EXCLUDED.agreement_number,
        contact_id = EXCLUDED.contact_id,
        property_id = EXCLUDED.property_id,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        monthly_rent = EXCLUDED.monthly_rent,
        rent_due_date = EXCLUDED.rent_due_date,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        security_deposit = EXCLUDED.security_deposit,
        broker_id = EXCLUDED.broker_id,
        broker_fee = EXCLUDED.broker_fee,
        owner_id = EXCLUDED.owner_id,
        previous_agreement_id = EXCLUDED.previous_agreement_id,
        updated_at = NOW(),
        version = COALESCE(rental_agreements.version, 1) + 1,
        deleted_at = NULL
      WHERE (rental_agreements.org_id = $2 OR rental_agreements.tenant_id = $2) ${versionWhereClause}
      RETURNING *`,
      upsertParams
    );
    const saved = result[0];

    if (!saved) {
      console.error('❌ POST /rental-agreements - UPSERT returned no rows (version conflict or tenant mismatch):', {
        agreementId,
        tenantId: req.tenantId,
        isUpdate,
        serverVersion,
        clientVersion
      });
      return res.status(409).json({
        error: 'Failed to save rental agreement',
        message: 'The agreement could not be saved due to a version conflict. Please refresh and try again.',
        serverVersion
      });
    }

    const transformedSaved = transformRentalAgreement(saved);

    console.log('✅ POST /rental-agreements - Agreement saved successfully:', {
      id: saved.id,
      agreementNumber: saved.agreement_number,
      tenantId: req.tenantId,
      isUpdate
    });

    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      console.log('📡 POST /rental-agreements - Emitting RENTAL_AGREEMENT_UPDATED event');
      emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
        agreement: transformedSaved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      console.log('📡 POST /rental-agreements - Emitting RENTAL_AGREEMENT_CREATED event');
      emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_CREATED, {
        agreement: transformedSaved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }

    res.status(isUpdate ? 200 : 201).json(transformedSaved);
  } catch (error: any) {
    console.error('Error creating/updating rental agreement:', error);
    console.error('Error details:', {
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
      constraint: error?.constraint,
      column: error?.column,
      table: error?.table
    });

    // Handle specific PostgreSQL error codes
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        error: 'Agreement number already exists',
        message: `An agreement with this number already exists: ${error.detail || ''}`
      });
    }
    if (error.code === '23502') { // NOT NULL violation
      return res.status(400).json({
        error: 'Missing required field',
        message: `Required field is missing: ${error.column || error.detail || 'unknown field'}`,
        detail: error.detail
      });
    }
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({
        error: 'Invalid reference',
        message: `Referenced record does not exist: ${error.detail || error.constraint || 'unknown reference'}`,
        detail: error.detail
      });
    }

    res.status(500).json({
      error: 'Failed to save rental agreement',
      message: error?.message || 'Unknown error',
      code: error?.code
    });
  }
});

// PUT update rental agreement
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreement = req.body;
    const agreementId = req.params.id;

    // Check if agreement exists and get its current status
    const existing = await db.query(
      'SELECT id, status, version FROM rental_agreements WHERE id = $1 AND org_id = $2',
      [agreementId, req.tenantId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }

    const existingAgreement = existing[0];

    // Check if invoices exist and if status is not Renewed
    const hasInvoices = await db.query(
      'SELECT COUNT(*) as count FROM invoices WHERE agreement_id = $1 AND tenant_id = $2',
      [agreementId, req.tenantId]
    );

    const invoiceCount = parseInt(hasInvoices[0]?.count || '0', 10);
    const isChangingStatusToRenewed = agreement.status === 'Renewed' && existingAgreement.status !== 'Renewed';

    if (invoiceCount > 0 && existingAgreement.status !== 'Renewed') {
      // Only allow changing status to Renewed, prevent other field changes
      if (isChangingStatusToRenewed) {
        // Allow only status update, preserve all other fields from existing agreement
        const result = await db.query(
          `UPDATE rental_agreements 
           SET status = $1, updated_at = NOW(),
               version = COALESCE(version, 1) + 1
           WHERE id = $2 AND org_id = $3
           RETURNING *`,
          ['Renewed', agreementId, req.tenantId]
        );

        if (result.length === 0) {
          return res.status(404).json({ error: 'Rental agreement not found' });
        }

        const transformedResult = transformRentalAgreement(result[0]);
        emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
          agreement: transformedResult,
          userId: req.user?.userId,
          username: req.user?.username,
        });

        return res.json(transformedResult);
      } else {
        return res.status(400).json({
          error: 'Cannot edit agreement',
          message: 'This agreement has invoices associated with it. To modify the agreement, you must first change its status to "Renewed".'
        });
      }
    }

    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE rental_agreements 
      SET agreement_number = $1, contact_id = $2, property_id = $3, start_date = $4, end_date = $5,
          monthly_rent = $6, rent_due_date = $7, status = $8, description = $9,
          security_deposit = $10, broker_id = $11, broker_fee = $12, owner_id = $13,
          updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $14 AND org_id = $15
    `;
    const queryParams: any[] = [
      agreement.agreementNumber,
      agreement.contactId || null,
      agreement.propertyId,
      agreement.startDate,
      agreement.endDate,
      agreement.monthlyRent,
      agreement.rentDueDate,
      agreement.status,
      agreement.description || null,
      agreement.securityDeposit || null,
      agreement.brokerId || null,
      agreement.brokerFee || null,
      agreement.ownerId || null,
      agreementId,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $16`;
      queryParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;
    const result = await db.query(updateQuery, queryParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }

    const transformedResult = transformRentalAgreement(result[0]);

    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
      agreement: transformedResult,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(transformedResult);
  } catch (error) {
    console.error('Error updating rental agreement:', error);
    res.status(500).json({ error: 'Failed to update rental agreement' });
  }
});

// GET invoices linked to a rental agreement
router.get('/:id/invoices', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoices = await db.query(
      `SELECT * FROM invoices WHERE agreement_id = $1 AND tenant_id = $2 ORDER BY due_date DESC`,
      [req.params.id, req.tenantId]
    );
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching agreement invoices:', error);
    res.status(500).json({ error: 'Failed to fetch agreement invoices' });
  }
});

// POST renew a rental agreement
router.post('/:id/renew', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantInfo = await getTenantColumnInfo();
    const oldId = req.params.id;
    const body = req.body;
    // body: { newAgreementId, agreementNumber, startDate, endDate, monthlyRent, rentDueDate, securityDeposit, brokerId, brokerFee, description, ownerId, generateInvoices, invoiceSettings? }

    // 1. Fetch old agreement
    const oldRows = await db.query(
      `SELECT * FROM rental_agreements WHERE id = $1 AND ${buildTenantClause(tenantInfo, 2)}`,
      [oldId, req.tenantId]
    );
    if (oldRows.length === 0) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    const old = oldRows[0];

    // 2. Check old is Active
    if (old.status !== 'Active') {
      return res.status(400).json({ error: 'Only active agreements can be renewed' });
    }

    // 3. Check for open invoices
    const openInvRows = await db.query(
      `SELECT COUNT(*) as count FROM invoices WHERE agreement_id = $1 AND tenant_id = $2 AND status != 'Paid'`,
      [oldId, req.tenantId]
    );
    const openCount = parseInt(openInvRows[0]?.count || '0', 10);
    if (openCount > 0) {
      return res.status(400).json({
        error: 'Cannot renew',
        message: `There are ${openCount} open invoice(s). All invoices must be paid before renewal.`
      });
    }

    // 4. Mark old agreement as Renewed
    await db.query(
      `UPDATE rental_agreements SET status = 'Renewed', updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND ${buildTenantClause(tenantInfo, 2)}`,
      [oldId, req.tenantId]
    );

    // 5. Deactivate old recurring templates
    await db.query(
      `UPDATE recurring_invoice_templates SET active = false WHERE agreement_id = $1 AND tenant_id = $2 AND active = true`,
      [oldId, req.tenantId]
    );

    // 6. Create new agreement
    const newId = body.newAgreementId || `ra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const insertCols = ['id'];
    const insertVals: any[] = [newId];

    if (tenantInfo.hasOrgId) { insertCols.push('org_id'); insertVals.push(req.tenantId); }
    if (tenantInfo.hasTenantId) { insertCols.push('tenant_id'); insertVals.push(req.tenantId); }

    insertCols.push(
      'agreement_number', 'contact_id', 'property_id',
      'start_date', 'end_date', 'monthly_rent', 'rent_due_date',
      'status', 'description', 'security_deposit',
      'broker_id', 'broker_fee', 'owner_id', 'previous_agreement_id',
      'created_at', 'updated_at', 'version'
    );
    insertVals.push(
      body.agreementNumber,
      old.contact_id,
      old.property_id,
      body.startDate,
      body.endDate,
      body.monthlyRent,
      body.rentDueDate ?? old.rent_due_date,
      'Active',
      body.description || old.description || null,
      body.securityDeposit ?? old.security_deposit ?? null,
      body.brokerId ?? old.broker_id ?? null,
      body.brokerFee ?? old.broker_fee ?? null,
      body.ownerId ?? old.owner_id ?? null,
      oldId, // previous_agreement_id
      'NOW()', // placeholders...
      'NOW()',
      '1'
    );

    // Build placeholders (last two are NOW())
    const placeholders = insertCols.map((_, i) => {
      if (i === insertCols.length - 2 || i === insertCols.length - 1) return 'NOW()';
      return `$${i + 1}`;
    });
    // Remove the last two vals since we use literal NOW()
    insertVals.splice(insertVals.length - 2, 2);

    const newResult = await db.query(
      `INSERT INTO rental_agreements (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      insertVals
    );
    const newAgreement = transformRentalAgreement(newResult[0]);

    // 7. Optionally generate invoices
    const generatedInvoices: any[] = [];
    if (body.generateInvoices) {
      const settings = body.invoiceSettings || {};
      const prefix = settings.prefix || 'INV-';
      const padding = settings.padding || 5;
      let nextNum = settings.nextNumber || 1;

      // Helper to get next invoice number
      const getNextNum = async () => {
        const maxRow = await db.query(
          `SELECT invoice_number FROM invoices WHERE tenant_id = $1 AND invoice_number LIKE $2 ORDER BY invoice_number DESC LIMIT 1`,
          [req.tenantId, `${prefix}%`]
        );
        if (maxRow.length > 0) {
          const numPart = parseInt(maxRow[0].invoice_number.slice(prefix.length), 10);
          if (!isNaN(numPart) && numPart >= nextNum) nextNum = numPart + 1;
        }
        const num = `${prefix}${String(nextNum).padStart(padding, '0')}`;
        nextNum++;
        return num;
      };

      const oldSec = parseFloat(old.security_deposit) || 0;
      const newSec = parseFloat(body.securityDeposit) || 0;
      const increment = Math.max(0, newSec - oldSec);
      const rentAmt = parseFloat(body.monthlyRent) || 0;

      // a. Incremental Security Deposit Invoice
      if (increment > 0) {
        const invNum = await getNextNum();
        const secCatRow = await db.query(`SELECT id FROM categories WHERE tenant_id = $1 AND name = 'Security Deposit' LIMIT 1`, [req.tenantId]);
        const secCatId = secCatRow[0]?.id || null;

        const secInv = await db.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, invoice_type, amount, paid_amount, status, issue_date, due_date, description, property_id, building_id, category_id, agreement_id, security_deposit_charge, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,0,'Unpaid',$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING *`,
          [
            `inv-sec-ren-${Date.now()}`, req.tenantId, invNum, old.contact_id, 'Rental',
            increment, body.startDate, body.startDate,
            'Incremental Security Deposit (Renewal) [Security]',
            old.property_id, old.building_id || null, secCatId, newId, increment
          ]
        );
        generatedInvoices.push(secInv[0]);
      }

      // b. First Month Rent Invoice
      if (rentAmt > 0) {
        const invNum = await getNextNum();
        const rentCatRow = await db.query(`SELECT id FROM categories WHERE tenant_id = $1 AND name = 'Rental Income' LIMIT 1`, [req.tenantId]);
        const rentCatId = rentCatRow[0]?.id || null;
        const monthName = new Date(body.startDate).toLocaleString('default', { month: 'long', year: 'numeric' });

        const rentInv = await db.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, invoice_type, amount, paid_amount, status, issue_date, due_date, description, property_id, building_id, category_id, agreement_id, rental_month, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,0,'Unpaid',$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING *`,
          [
            `inv-rent-ren-${Date.now()}`, req.tenantId, invNum, old.contact_id, 'Rental',
            rentAmt, body.startDate, body.startDate,
            `Rent for ${monthName} (Renewal) [Rental]`,
            old.property_id, old.building_id || null, rentCatId, newId,
            body.startDate.slice(0, 7)
          ]
        );
        generatedInvoices.push(rentInv[0]);

        // c. Create new recurring template
        const nextMonth = new Date(body.startDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        await db.query(
          `INSERT INTO recurring_invoice_templates (id, tenant_id, contact_id, property_id, building_id, amount, description_template, day_of_month, next_due_date, active, agreement_id, invoice_type, auto_generate, frequency, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,true,'Monthly',NOW(),NOW())`,
          [
            `rec-ren-${Date.now()}`, req.tenantId, old.contact_id, old.property_id,
            old.building_id || '', rentAmt, 'Rent for {Month} [Rental]',
            body.rentDueDate ?? old.rent_due_date ?? 1,
            nextMonth.toISOString().split('T')[0],
            newId, 'Rental'
          ]
        );
      }

      // Update invoice settings nextNumber
      if (body.invoiceSettings) {
        body.invoiceSettings.nextNumber = nextNum;
      }
    }

    // 8. Emit WebSocket events
    // Old agreement updated
    const updatedOldRows = await db.query(`SELECT * FROM rental_agreements WHERE id = $1`, [oldId]);
    const updatedOld = transformRentalAgreement(updatedOldRows[0]);
    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
      agreement: updatedOld,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    // New agreement created
    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_CREATED, {
      agreement: newAgreement,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json({
      oldAgreement: updatedOld,
      newAgreement,
      generatedInvoices,
      nextInvoiceNumber: body.generateInvoices ? body.invoiceSettings?.nextNumber : undefined
    });
  } catch (error: any) {
    console.error('Error renewing rental agreement:', error);
    res.status(500).json({ error: 'Failed to renew agreement', message: error?.message });
  }
});

// POST terminate a rental agreement
router.post('/:id/terminate', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantInfo = await getTenantColumnInfo();
    const agreementId = req.params.id;
    const body = req.body;
    // body: { endDate, status ('Terminated'|'Expired'), refundAction ('COMPANY_REFUND'|'OWNER_DIRECT'|'NONE'), refundAmount?, refundAccountId?, notes? }

    // 1. Fetch agreement
    const rows = await db.query(
      `SELECT * FROM rental_agreements WHERE id = $1 AND ${buildTenantClause(tenantInfo, 2)}`,
      [agreementId, req.tenantId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    const agreement = rows[0];

    // 2. Check for open invoices
    const openInvRows = await db.query(
      `SELECT COUNT(*) as count FROM invoices WHERE agreement_id = $1 AND tenant_id = $2 AND status != 'Paid'`,
      [agreementId, req.tenantId]
    );
    const openCount = parseInt(openInvRows[0]?.count || '0', 10);
    if (openCount > 0) {
      return res.status(400).json({
        error: 'Cannot terminate',
        message: `There are ${openCount} open invoice(s). All invoices must be paid before termination.`
      });
    }

    // 3. Process refund if needed
    let refundTransaction = null;
    if (body.refundAction === 'COMPANY_REFUND') {
      const amount = parseFloat(body.refundAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid refund amount' });
      }
      if (!body.refundAccountId) {
        return res.status(400).json({ error: 'Refund account is required' });
      }

      // Find Security Deposit Refund category
      const catRow = await db.query(
        `SELECT id FROM categories WHERE tenant_id = $1 AND name = 'Security Deposit Refund' LIMIT 1`,
        [req.tenantId]
      );
      const catId = catRow[0]?.id || null;

      const txResult = await db.query(
        `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, contact_id, property_id, created_at, updated_at)
         VALUES ($1,$2,'Expense',$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *`,
        [
          `tx-refund-${Date.now()}`, req.tenantId, amount, body.endDate,
          `Security Deposit Refund - Agreement #${agreement.agreement_number} (${body.notes || body.status})`,
          body.refundAccountId, catId, agreement.contact_id, agreement.property_id
        ]
      );
      refundTransaction = txResult[0];
    }

    // 4. Update agreement status and end date
    let description = agreement.description || '';
    if (body.refundAction === 'OWNER_DIRECT') {
      description += ` | Terminated on ${body.endDate}. Security refunded directly by Owner.`;
    } else {
      description += ` | ${body.status} on ${body.endDate}`;
    }
    if (body.notes) {
      description += ` | Notes: ${body.notes}`;
    }

    const updateResult = await db.query(
      `UPDATE rental_agreements SET status = $1, end_date = $2, description = $3, updated_at = NOW(), version = COALESCE(version, 1) + 1
       WHERE id = $4 AND ${buildTenantClause(tenantInfo, 5)}
       RETURNING *`,
      [body.status || 'Terminated', body.endDate, description, agreementId, req.tenantId]
    );

    // 5. Deactivate recurring templates
    await db.query(
      `UPDATE recurring_invoice_templates SET active = false WHERE agreement_id = $1 AND tenant_id = $2 AND active = true`,
      [agreementId, req.tenantId]
    );

    const updated = transformRentalAgreement(updateResult[0]);

    // 6. Emit WS event
    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
      agreement: updated,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ agreement: updated, refundTransaction });
  } catch (error: any) {
    console.error('Error terminating rental agreement:', error);
    res.status(500).json({ error: 'Failed to terminate agreement', message: error?.message });
  }
});

// DELETE rental agreement
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantInfo = await getTenantColumnInfo();
    const result = await db.query(
      `UPDATE rental_agreements SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND ${buildTenantClause(tenantInfo, 2)} RETURNING id`,
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_DELETED, {
      agreementId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rental agreement:', error);
    res.status(500).json({ error: 'Failed to delete rental agreement' });
  }
});

export default router;

