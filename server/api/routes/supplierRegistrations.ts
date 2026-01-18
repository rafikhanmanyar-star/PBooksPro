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
    const { buyerOrganizationEmail, supplierMessage } = req.body;
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

    // Create registration request
    const requestId = `sr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request = await db.query(
      `INSERT INTO supplier_registration_requests 
       (id, supplier_tenant_id, buyer_tenant_id, buyer_organization_email, status, supplier_message, tenant_id)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
       RETURNING *`,
      [requestId, supplierTenantId, buyerTenant.id, buyerOrganizationEmail, supplierMessage || null, supplierTenantId]
    );

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

    // Create entry in registered_suppliers table
    const registrationId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      await db.query(
        `INSERT INTO registered_suppliers 
         (id, buyer_tenant_id, supplier_tenant_id, registration_request_id, registered_at, registered_by, status, notes, tenant_id)
         VALUES ($1, $2, $3, $4, NOW(), $5, 'ACTIVE', $6, $7)
         ON CONFLICT (buyer_tenant_id, supplier_tenant_id) 
         DO UPDATE SET status = 'ACTIVE', registered_at = NOW(), registration_request_id = $4, registered_by = $5, notes = $6`,
        [registrationId, buyerTenantId, request.supplier_tenant_id, requestId, buyerTenantId, comments || null, buyerTenantId]
      );
    } catch (error: any) {
      console.error('Error creating registered_suppliers entry:', error);
      // Continue even if this fails - the request is still approved
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
    const suppliers = await db.query(
      `SELECT t.id, t.name, t.company_name, t.email, t.phone, t.address,
              t.tax_id, t.payment_terms, t.supplier_category, t.supplier_status,
              rs.registered_at, rs.status as registration_status, rs.notes
       FROM registered_suppliers rs
       INNER JOIN tenants t ON rs.supplier_tenant_id = t.id
       WHERE rs.buyer_tenant_id = $1 AND rs.status = 'ACTIVE'
       ORDER BY rs.registered_at DESC`,
      [buyerTenantId]
    );

    res.json(suppliers);
  } catch (error: any) {
    console.error('Error fetching registered suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch registered suppliers' });
  }
});

export default router;