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
              b.name as buyer_name, b.company_name as buyer_company_name
       FROM supplier_registration_requests sr
       LEFT JOIN tenants b ON sr.buyer_tenant_id = b.id
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
      // Supplier-provided registration details
      regSupplierName: req.reg_supplier_name,
      regSupplierCompany: req.reg_supplier_company,
      regSupplierContactNo: req.reg_supplier_contact_no,
      regSupplierAddress: req.reg_supplier_address,
      regSupplierDescription: req.reg_supplier_description,
      // Expanded fields from tenant lookup
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
 * Buyer approves a supplier registration request
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
       SET status = 'APPROVED', 
           buyer_comments = $1,
           reviewed_at = NOW(),
           reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [comments || null, buyerTenantId, requestId]
    );

    // Create entry in registered_suppliers table with supplier details from registration request
    const registrationId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      await db.query(
        `INSERT INTO registered_suppliers 
         (id, buyer_tenant_id, supplier_tenant_id, registration_request_id, registered_at, registered_by, status, notes, tenant_id,
          supplier_name, supplier_company, supplier_contact_no, supplier_address, supplier_description)
         VALUES ($1, $2, $3, $4, NOW(), $5, 'ACTIVE', $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (buyer_tenant_id, supplier_tenant_id) 
         DO UPDATE SET status = 'ACTIVE', registered_at = NOW(), registration_request_id = $4, registered_by = $5, notes = $6,
           supplier_name = $8, supplier_company = $9, supplier_contact_no = $10, supplier_address = $11, supplier_description = $12`,
        [registrationId, buyerTenantId, request.supplier_tenant_id, requestId, buyerTenantId, comments || null, buyerTenantId,
         request.reg_supplier_name, request.reg_supplier_company, request.reg_supplier_contact_no, 
         request.reg_supplier_address, request.reg_supplier_description]
      );
    } catch (error: any) {
      console.error('Error creating registered_suppliers entry:', error);
      // Continue even if this fails - the request is still approved
    }

    // Also create/update a contact in the vendor directory for this supplier
    try {
      const supplierCompany = request.reg_supplier_company || 'Supplier';
      const supplierName = request.reg_supplier_name || supplierCompany;
      const supplierContactNo = request.reg_supplier_contact_no || '';
      const supplierAddress = request.reg_supplier_address || '';
      const supplierDescription = request.reg_supplier_description || '';

      // Check if a contact already exists for this supplier
      const existingContact = await db.query(
        `SELECT id FROM contacts WHERE tenant_id = $1 AND contact_type = 'Vendor' AND company_name = $2 LIMIT 1`,
        [buyerTenantId, supplierCompany]
      );

      if (existingContact && existingContact.length > 0) {
        // Update existing contact with latest info
        await db.query(
          `UPDATE contacts SET 
            name = $1, phone = $2, address = $3, notes = $4, updated_at = NOW()
           WHERE id = $5`,
          [supplierName, supplierContactNo, supplierAddress, supplierDescription, existingContact[0].id]
        );
        console.log(`Updated vendor contact for supplier: ${supplierCompany}`);
      } else {
        // Create new contact in vendor directory
        const contactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.query(
          `INSERT INTO contacts (id, name, company_name, phone, address, notes, contact_type, tenant_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Vendor', $7, NOW(), NOW())`,
          [contactId, supplierName, supplierCompany, supplierContactNo, supplierAddress, supplierDescription, buyerTenantId]
        );
        console.log(`Created vendor contact for supplier: ${supplierCompany} (${contactId})`);
        
        // Emit WebSocket event for new contact
        emitToTenant(buyerTenantId, WS_EVENTS.CONTACT_CREATED, {
          id: contactId,
          name: supplierName,
          companyName: supplierCompany,
          phone: supplierContactNo,
          address: supplierAddress,
          notes: supplierDescription,
          contactType: 'Vendor',
          tenantId: buyerTenantId
        });
      }
    } catch (contactError: any) {
      console.error('Error creating/updating vendor contact:', contactError);
      // Continue even if this fails - the registration is still approved
    }

    // Emit WebSocket event to supplier
    if (req.tenantId) {
      emitToTenant(request.supplier_tenant_id, WS_EVENTS.DATA_UPDATED, {
        type: 'SUPPLIER_REGISTRATION_APPROVED',
        requestId: requestId,
        buyerTenantId: buyerTenantId
      });
    }

    res.json(updated[0]);
  } catch (error: any) {
    console.error('Error approving registration request:', error);
    res.status(500).json({ error: 'Failed to approve registration request' });
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
    // Join with tenants table to get supplier details
    // IMPORTANT: Exclude own organization - a supplier cannot be in their own organization's supplier list
    const suppliers = await db.query(
      `SELECT t.id, t.name, t.company_name, t.email, t.phone, t.address,
              t.tax_id, t.payment_terms, t.supplier_category, t.supplier_status,
              rs.registered_at, rs.status as registration_status, rs.notes,
              rs.supplier_name as reg_supplier_name, rs.supplier_company as reg_supplier_company,
              rs.supplier_contact_no as reg_supplier_contact_no, rs.supplier_address as reg_supplier_address,
              rs.supplier_description as reg_supplier_description
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
      // Use registration details if available, fallback to tenant info
      name: s.reg_supplier_name || s.name,
      companyName: s.reg_supplier_company || s.company_name,
      contactNo: s.reg_supplier_contact_no || s.phone,
      address: s.reg_supplier_address || s.address,
      description: s.reg_supplier_description,
      // Original tenant info
      email: s.email,
      phone: s.phone,
      taxId: s.tax_id,
      paymentTerms: s.payment_terms,
      supplierCategory: s.supplier_category,
      supplierStatus: s.supplier_status,
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

export default router;