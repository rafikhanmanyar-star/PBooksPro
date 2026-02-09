import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * POST /api/supplier-registrations/request
 * Supplier sends a registration request to a buyer organization
 */
router.post('/request', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { 
      buyerOrganizationEmail, 
      supplierMessage,
      regSupplierName,
      regSupplierCompany,
      regSupplierContactNo,
      regSupplierAddress,
      regSupplierDescription
    } = req.body;
    const supplierTenantId = req.tenantId;

    if (!supplierTenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!buyerOrganizationEmail) {
      return res.status(400).json({ error: 'Buyer organization email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyerOrganizationEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Find buyer tenant by email (case-insensitive)
    const buyers = await db.query(
      'SELECT id, name, company_name, email FROM tenants WHERE LOWER(email) = LOWER($1)',
      [buyerOrganizationEmail]
    );

    if (buyers.length === 0) {
      return res.status(404).json({ error: 'Organization not found with the provided email' });
    }

    if (buyers.length > 1) {
      return res.status(400).json({ error: 'Multiple organizations found with the same email. Please contact support.' });
    }

    const buyerTenant = buyers[0];

    // Check if supplier is trying to register with themselves
    if (buyerTenant.id === supplierTenantId) {
      return res.status(400).json({ error: 'Cannot send registration request to your own organization' });
    }

    // Check if already registered (approved) in registered_suppliers table
    const existingRegistered = await db.query(
      `SELECT id FROM registered_suppliers 
       WHERE supplier_tenant_id = $1 AND buyer_tenant_id = $2 AND status = 'ACTIVE'`,
      [supplierTenantId, buyerTenant.id]
    );

    if (existingRegistered.length > 0) {
      return res.status(400).json({ error: 'You are already registered with this organization' });
    }

    // Check if there's already a pending request
    const existingPending = await db.query(
      `SELECT id FROM supplier_registration_requests 
       WHERE supplier_tenant_id = $1 AND buyer_tenant_id = $2 AND status = 'PENDING'`,
      [supplierTenantId, buyerTenant.id]
    );

    if (existingPending.length > 0) {
      return res.status(400).json({ error: 'A pending registration request already exists for this organization' });
    }

    // Check if there's an approved request (should already be in registered_suppliers, but check anyway)
    const existingApproved = await db.query(
      `SELECT id FROM supplier_registration_requests 
       WHERE supplier_tenant_id = $1 AND buyer_tenant_id = $2 AND status = 'APPROVED'`,
      [supplierTenantId, buyerTenant.id]
    );

    if (existingApproved.length > 0) {
      return res.status(400).json({ error: 'You are already registered with this organization' });
    }

    // Validate required supplier fields
    if (!regSupplierName || !regSupplierCompany) {
      return res.status(400).json({ error: 'Supplier name and company are required' });
    }

    // Create registration request
    const requestId = `sr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let request: any[] = [];

    try {
      request = await db.query(
        `INSERT INTO supplier_registration_requests 
         (id, supplier_tenant_id, buyer_tenant_id, buyer_organization_email, status, supplier_message, tenant_id,
          reg_supplier_name, reg_supplier_company, reg_supplier_contact_no, reg_supplier_address, reg_supplier_description)
         VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [requestId, supplierTenantId, buyerTenant.id, buyerOrganizationEmail, supplierMessage || null, supplierTenantId,
         regSupplierName, regSupplierCompany, regSupplierContactNo || null, regSupplierAddress || null, regSupplierDescription || null]
      );
    } catch (insertError: any) {
      const errorMessage = String(insertError?.message || '');
      if (errorMessage.toLowerCase().includes('reg_supplier_')) {
        // Backward compatibility: some environments may not have the new columns yet.
        request = await db.query(
          `INSERT INTO supplier_registration_requests 
           (id, supplier_tenant_id, buyer_tenant_id, buyer_organization_email, status, supplier_message, tenant_id)
           VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
           RETURNING *`,
          [requestId, supplierTenantId, buyerTenant.id, buyerOrganizationEmail, supplierMessage || null, supplierTenantId]
        );
      } else {
        throw insertError;
      }
    }

    // Emit WebSocket event to buyer
    emitToTenant(buyerTenant.id, WS_EVENTS.DATA_UPDATED, {
      type: 'SUPPLIER_REGISTRATION_REQUEST',
      requestId: requestId,
      supplierTenantId: supplierTenantId
    });

    res.json(request[0]);
  } catch (error: any) {
    console.error('Error creating supplier registration request:', error);
    res.status(500).json({ error: 'Failed to create registration request' });
  }
});

/**
 * GET /api/supplier-registrations/requests
 * Get all registration requests for the current tenant (as buyer)
 */
router.get('/requests', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const buyerTenantId = req.tenantId;
    const { status } = req.query;

    if (!buyerTenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let query = `
      SELECT sr.*, 
             s.name as supplier_name, s.company_name as supplier_company_name,
             b.name as buyer_name, b.company_name as buyer_company_name
      FROM supplier_registration_requests sr
      LEFT JOIN tenants s ON sr.supplier_tenant_id = s.id
      LEFT JOIN tenants b ON sr.buyer_tenant_id = b.id
      WHERE sr.buyer_tenant_id = $1
    `;
    const params: any[] = [buyerTenantId];

    if (status) {
      query += ` AND sr.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY sr.requested_at DESC`;

    const requests = await db.query(query, params);

    // Map to include expanded fields
    const mappedRequests = requests.map((req: any) => ({
      id: req.id,
      supplierTenantId: req.supplier_tenant_id,
      buyerTenantId: req.buyer_tenant_id,
      buyerOrganizationEmail: req.buyer_organization_email,
      status: req.status,
      supplierMessage: req.supplier_message,
      buyerComments: req.buyer_comments,
      requestedAt: req.requested_at,
      reviewedAt: req.reviewed_at,
      reviewedBy: req.reviewed_by,
      tenantId: req.tenant_id,
      // Supplier-provided registration details
      regSupplierName: req.reg_supplier_name,
      regSupplierCompany: req.reg_supplier_company,
      regSupplierContactNo: req.reg_supplier_contact_no,
      regSupplierAddress: req.reg_supplier_address,
      regSupplierDescription: req.reg_supplier_description,
      // Expanded fields from tenant lookup
      supplierName: req.supplier_name,
      supplierCompanyName: req.supplier_company_name,
      buyerName: req.buyer_name,
      buyerCompanyName: req.buyer_company_name
    }));

    res.json(mappedRequests);
  } catch (error: any) {
    console.error('Error fetching registration requests:', error);
    res.status(500).json({ error: 'Failed to fetch registration requests' });
  }
});

/**
 * GET /api/supplier-registrations/my-requests
 * Get all registration requests sent by the current tenant (as supplier)
 */
router.get('/my-requests', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const supplierTenantId = req.tenantId;

    if (!supplierTenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requests = await db.query(
      `SELECT sr.*, 
              b.name as buyer_name, b.company_name as buyer_company_name,
              (rs.id IS NOT NULL AND rs.status = 'ACTIVE') as is_registration_active
       FROM supplier_registration_requests sr
       LEFT JOIN tenants b ON sr.buyer_tenant_id = b.id
       LEFT JOIN registered_suppliers rs ON rs.supplier_tenant_id = sr.supplier_tenant_id AND rs.buyer_tenant_id = sr.buyer_tenant_id AND rs.status = 'ACTIVE'
       WHERE sr.supplier_tenant_id = $1
       ORDER BY sr.requested_at DESC`,
      [supplierTenantId]
    );

    // Map to include expanded fields
    const mappedRequests = requests.map((req: any) => ({
      id: req.id,
      supplierTenantId: req.supplier_tenant_id,
      buyerTenantId: req.buyer_tenant_id,
      buyerOrganizationEmail: req.buyer_organization_email,
      status: req.status,
      supplierMessage: req.supplier_message,
      buyerComments: req.buyer_comments,
      requestedAt: req.requested_at,
      reviewedAt: req.reviewed_at,
      reviewedBy: req.reviewed_by,
      tenantId: req.tenant_id,
      isRegistrationActive: !!req.is_registration_active,
      regSupplierName: req.reg_supplier_name,
      regSupplierCompany: req.reg_supplier_company,
      regSupplierContactNo: req.reg_supplier_contact_no,
      regSupplierAddress: req.reg_supplier_address,
      regSupplierDescription: req.reg_supplier_description,
      buyerName: req.buyer_name,
      buyerCompanyName: req.buyer_company_name
    }));

    res.json(mappedRequests);
  } catch (error: any) {
    console.error('Error fetching my registration requests:', error);
    res.status(500).json({ error: 'Failed to fetch registration requests' });
  }
});

/**
 * PUT /api/supplier-registrations/:id/approve
 *
 * On Approve (after commit), this handler:
 * 1. Changes the registration request status to APPROVED
 * 2. Creates/updates an entry in registered_suppliers (buyer_tenant_id + supplier_tenant_id) so the supplier appears in the buyer dashboard list
 * 3. Adds the supplier to the buyer's vendor list (vendors table) using registration request fields:
 *    - Full name <- reg_supplier_name
 *    - Company name <- reg_supplier_company
 *    - Phone number <- reg_supplier_contact_no
 *    - Business address <- reg_supplier_address
 *    - Note/description <- reg_supplier_description
 * 4. Supplier dashboard (Org A) shows the approved buyer company via my-requests (buyer_name, buyer_company_name); buyer dashboard (Org B) shows registered suppliers via GET /registered
 */
router.put('/:id/approve', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const requestId = req.params.id;
    const buyerTenantId = req.tenantId;
    const { comments } = req.body;

    if (!buyerTenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let request: any;
    let updatedRow: any;
    let savedContact: any = null;

    await db.transaction(async (client: any) => {
      // Get request and verify it belongs to this buyer
      const reqResult = await client.query(
        'SELECT * FROM supplier_registration_requests WHERE id = $1 AND buyer_tenant_id = $2',
        [requestId, buyerTenantId]
      );
      const requests = reqResult.rows || reqResult;

      if (!requests || requests.length === 0) {
        throw Object.assign(new Error('Registration request not found'), { statusCode: 404 });
      }

      request = requests[0];

      if (request.status !== 'PENDING') {
        throw Object.assign(new Error(`Request is already ${request.status.toLowerCase()}`), { statusCode: 400 });
      }

      // 1) Change status of the request to APPROVED
      const updateResult = await client.query(
        `UPDATE supplier_registration_requests 
         SET status = 'APPROVED', 
             buyer_comments = $1,
             reviewed_at = NOW(),
             reviewed_by = $2
         WHERE id = $3
         RETURNING *`,
        [comments || null, buyerTenantId, requestId]
      );
      const updated = (updateResult.rows || updateResult);
      if (!updated || updated.length === 0) {
        throw new Error('Failed to update registration request status');
      }
      updatedRow = updated[0];

      // 2) Create/update entry in registered_suppliers (requestor = supplier_tenant_id, approver = buyer_tenant_id) so supplier appears in buyer dashboard list
      const registrationId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO registered_suppliers 
         (id, buyer_tenant_id, supplier_tenant_id, registration_request_id, registered_at, registered_by, status, notes, tenant_id,
          "supplier_name", "supplier_company", "supplier_contact_no", "supplier_address", "supplier_description")
         VALUES ($1, $2, $3, $4, NOW(), $5, 'ACTIVE', $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (buyer_tenant_id, supplier_tenant_id) 
         DO UPDATE SET status = 'ACTIVE', registered_at = NOW(), registration_request_id = $4, registered_by = $5, notes = $6,
           "supplier_name" = $8, "supplier_company" = $9, "supplier_contact_no" = $10, "supplier_address" = $11, "supplier_description" = $12`,
        [registrationId, buyerTenantId, request.supplier_tenant_id, requestId, buyerTenantId, comments || null, buyerTenantId,
         request.reg_supplier_name ?? null, request.reg_supplier_company ?? null, request.reg_supplier_contact_no ?? null,
         request.reg_supplier_address ?? null, request.reg_supplier_description ?? null]
      );

      // 3) Add supplier to buyer's vendor list (vendors table): extract correct fields from registration request (DB uses snake_case)
      const fullName = (request.reg_supplier_name ?? request.reg_supplier_company ?? 'Supplier').toString().trim();
      const companyName = (request.reg_supplier_company ?? 'Supplier').toString().trim();
      const phoneNumber = (request.reg_supplier_contact_no ?? '').toString().trim();
      const businessAddress = (request.reg_supplier_address ?? '').toString().trim();
      const requestNote = (request.reg_supplier_description ?? '').toString().trim();
      const noteDescription = [requestNote, 'Supplier has been added from Biz Planet.'].filter(Boolean).join('\n');

      const existingVendorResult = await client.query(
        `SELECT id FROM vendors WHERE tenant_id = $1 AND company_name = $2 LIMIT 1`,
        [buyerTenantId, companyName]
      );
      const existingVendor = existingVendorResult.rows || existingVendorResult;

      if (existingVendor && existingVendor.length > 0) {
        await client.query(
          `UPDATE vendors SET 
            name = $1, contact_no = $2, address = $3, description = $4, updated_at = NOW()
           WHERE id = $5`,
          [fullName, phoneNumber, businessAddress, noteDescription || null, existingVendor[0].id]
        );
        const sel = await client.query('SELECT * FROM vendors WHERE id = $1', [existingVendor[0].id]);
        savedContact = (sel.rows || sel).length > 0 ? (sel.rows || sel)[0] : null;
      } else {
        const vendorId = `vendor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const insertVendorResult = await client.query(
          `INSERT INTO vendors (id, tenant_id, name, description, contact_no, company_name, address, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
           RETURNING *`,
          [vendorId, buyerTenantId, fullName, noteDescription || null, phoneNumber, companyName, businessAddress]
        );
        const inserted = (insertVendorResult.rows || insertVendorResult);
        savedContact = inserted && inserted.length > 0 ? inserted[0] : null;
      }
    });

    // Emit WebSocket so buyer Vendor Directory updates in real time
    if (savedContact) {
      emitToTenant(buyerTenantId, WS_EVENTS.VENDOR_CREATED, { vendor: savedContact });
    }

    // Emit WebSocket event to buyer (Org B) so Registered suppliers panel refreshes
    emitToTenant(buyerTenantId, WS_EVENTS.DATA_UPDATED, {
      type: 'REGISTERED_SUPPLIERS_UPDATED',
      requestId: requestId,
      supplierTenantId: request?.supplier_tenant_id
    });

    // Emit WebSocket event to supplier (Org A) so their dashboard refreshes
    if (request?.supplier_tenant_id) {
      emitToTenant(request.supplier_tenant_id, WS_EVENTS.DATA_UPDATED, {
        type: 'SUPPLIER_REGISTRATION_APPROVED',
        requestId: requestId,
        buyerTenantId: buyerTenantId
      });
    }

    res.json(updatedRow);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const isMissingColumn = /column\s+["']?supplier_/i.test(msg) && /registered_suppliers/i.test(msg);
    const statusCode = error?.statusCode || (isMissingColumn ? 503 : 500);
    const message = isMissingColumn
      ? 'Database schema is out of date: the registered_suppliers table is missing required columns. Please run the migration fix-registered-suppliers-column-names.sql on your PostgreSQL database (see server/migrations folder), then try approving again.'
      : (error?.message || 'Failed to approve registration request');
    console.error('Error approving registration request:', error);
    res.status(statusCode).json({ error: message });
  }
});

/**
 * PUT /api/supplier-registrations/:id/reject
 * Buyer rejects a supplier registration request
 */
router.put('/:id/reject', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const requestId = req.params.id;
    const buyerTenantId = req.tenantId;
    const { comments } = req.body;

    if (!buyerTenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get request and verify it belongs to this buyer
    const requests = await db.query(
      'SELECT * FROM supplier_registration_requests WHERE id = $1 AND buyer_tenant_id = $2',
      [requestId, buyerTenantId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Registration request not found' });
    }

    const request = requests[0];

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request is already ${request.status.toLowerCase()}` });
    }

    // Update request status
    const updated = await db.query(
      `UPDATE supplier_registration_requests 
       SET status = 'REJECTED', 
           buyer_comments = $1,
           reviewed_at = NOW(),
           reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [comments || null, buyerTenantId, requestId]
    );

    // Emit WebSocket event to supplier
    if (req.tenantId) {
      emitToTenant(request.supplier_tenant_id, WS_EVENTS.DATA_UPDATED, {
        type: 'SUPPLIER_REGISTRATION_REJECTED',
        requestId: requestId,
        buyerTenantId: buyerTenantId
      });
    }

    res.json(updated[0]);
  } catch (error: any) {
    console.error('Error rejecting registration request:', error);
    res.status(500).json({ error: 'Failed to reject registration request' });
  }
});

/**
 * GET /api/supplier-registrations/registered
 * Get all registered (approved) suppliers for the current buyer tenant
 */
router.get('/registered', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const buyerTenantId = req.tenantId;

    if (!buyerTenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get registered suppliers from registered_suppliers table (primary source)
    // Use double-quoted lowercase for rs columns so PostgreSQL uses exact names (avoids "Supplier_name" vs supplier_name)
    const suppliers = await db.query(
      `SELECT t.id, rs.supplier_tenant_id, t.name, t.company_name, t.email, t.phone, t.address,
              rs.registered_at, rs.status as registration_status, rs.notes,
              rs."supplier_name" as reg_supplier_name, rs."supplier_company" as reg_supplier_company,
              rs."supplier_contact_no" as reg_supplier_contact_no, rs."supplier_address" as reg_supplier_address,
              rs."supplier_description" as reg_supplier_description
       FROM registered_suppliers rs
       INNER JOIN tenants t ON rs.supplier_tenant_id = t.id
       WHERE rs.buyer_tenant_id = $1 
         AND rs.status = 'ACTIVE'
         AND rs.supplier_tenant_id != $1
       ORDER BY rs.registered_at DESC`,
      [buyerTenantId]
    );

    // Map to include both tenant info and registration details (prefer registration details if available)
    const mappedSuppliers = suppliers.map((s: any) => ({
      id: s.id,
      supplierTenantId: s.supplier_tenant_id || s.id,
      // Use registration details if available, fallback to tenant info
      name: s.reg_supplier_name || s.name,
      companyName: s.reg_supplier_company || s.company_name,
      contactNo: s.reg_supplier_contact_no || s.phone,
      address: s.reg_supplier_address || s.address,
      description: s.reg_supplier_description,
      email: s.email,
      phone: s.phone,
      registeredAt: s.registered_at,
      registrationStatus: s.registration_status,
      notes: s.notes
    }));

    res.json(mappedSuppliers);
  } catch (error: any) {
    console.error('Error fetching registered suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch registered suppliers' });
  }
});

/**
 * PUT /api/supplier-registrations/registered/:supplierTenantId/unregister
 * Buyer unregisters a supplier (removes from registered list)
 */
router.put('/registered/:supplierTenantId/unregister', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const buyerTenantId = req.tenantId;
    const supplierTenantId = req.params.supplierTenantId;

    if (!buyerTenantId || !supplierTenantId) {
      return res.status(400).json({ error: 'Missing buyer or supplier context' });
    }

    const result = await db.query(
      `UPDATE registered_suppliers SET status = 'REMOVED' 
       WHERE buyer_tenant_id = $1 AND supplier_tenant_id = $2 AND status = 'ACTIVE'
       RETURNING id`,
      [buyerTenantId, supplierTenantId]
    );
    const updated: any[] = Array.isArray(result) ? result : (result as { rows: any[] }).rows;
    if (!updated || updated.length === 0) {
      return res.status(404).json({ error: 'Registered supplier not found or already removed' });
    }

    emitToTenant(buyerTenantId, WS_EVENTS.DATA_UPDATED, { type: 'REGISTERED_SUPPLIERS_UPDATED' });
    emitToTenant(supplierTenantId, WS_EVENTS.DATA_UPDATED, { type: 'SUPPLIER_REGISTRATION_REVOKED', buyerTenantId });
    res.json({ success: true, message: 'Supplier unregistered' });
  } catch (error: any) {
    console.error('Error unregistering supplier:', error);
    res.status(500).json({ error: 'Failed to unregister supplier' });
  }
});

/**
 * PUT /api/supplier-registrations/my-registrations/:buyerTenantId/unregister
 * Supplier unregisters from a buyer (removes themselves from that buyer's list)
 */
router.put('/my-registrations/:buyerTenantId/unregister', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const supplierTenantId = req.tenantId;
    const buyerTenantId = req.params.buyerTenantId;

    if (!supplierTenantId || !buyerTenantId) {
      return res.status(400).json({ error: 'Missing buyer or supplier context' });
    }

    const result = await db.query(
      `UPDATE registered_suppliers SET status = 'REMOVED' 
       WHERE buyer_tenant_id = $1 AND supplier_tenant_id = $2 AND status = 'ACTIVE'
       RETURNING id`,
      [buyerTenantId, supplierTenantId]
    );
    const updatedMyReg: any[] = Array.isArray(result) ? result : (result as { rows: any[] }).rows;
    if (!updatedMyReg || updatedMyReg.length === 0) {
      return res.status(404).json({ error: 'Registration not found or already removed' });
    }

    emitToTenant(buyerTenantId, WS_EVENTS.DATA_UPDATED, { type: 'REGISTERED_SUPPLIERS_UPDATED' });
    emitToTenant(supplierTenantId, WS_EVENTS.DATA_UPDATED, { type: 'SUPPLIER_REGISTRATION_REVOKED', buyerTenantId });
    res.json({ success: true, message: 'Unregistered from buyer' });
  } catch (error: any) {
    console.error('Error unregistering from buyer:', error);
    res.status(500).json({ error: 'Failed to unregister' });
  }
});

export default router;