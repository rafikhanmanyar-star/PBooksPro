import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { LicenseService } from '../../services/licenseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';
import { getWebSocketService } from '../../services/websocketService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Get current tenant info (for authenticated tenant)
router.get('/me', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenants = await db.query(
      'SELECT id, name, company_name, email, license_type, license_status, license_expiry_date, trial_start_date, is_supplier FROM tenants WHERE id = $1',
      [req.tenantId]
    );

    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenants[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenant info' });
  }
});

// Update current tenant info (for authenticated tenant)
router.put('/me', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { isSupplier } = req.body;

    // Only allow updating is_supplier flag for self-service
    if (isSupplier === undefined) {
      return res.status(400).json({ error: 'isSupplier field is required' });
    }

    // Update tenant's is_supplier flag
    const result = await db.query(
      'UPDATE tenants SET is_supplier = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [isSupplier === true || isSupplier === 'true', req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Emit WebSocket event
    emitToTenant(req.tenantId!, WS_EVENTS.SUPPLIER_PROMOTED, {
      tenantId: result[0].id,
      isSupplier: result[0].is_supplier
    });

    res.json(result[0]);
  } catch (error: any) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ error: 'Failed to update tenant info' });
  }
});

// Check license status
router.get('/license-status', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const db = getDb();
    const licenseService = new LicenseService(db);
    const licenseInfo = await licenseService.checkLicenseStatus(tenantId);
    const modules = await licenseService.getTenantModules(tenantId);

    res.json({
      ...licenseInfo,
      modules
    });
  } catch (error) {
    console.error('License status check error:', error);
    res.status(500).json({ error: 'Failed to check license status' });
  }
});

// Check if real-time sync should be enabled for this organization
// Sync is only enabled if there are 2+ active users (potential for collaboration)
router.get('/should-enable-sync', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;

    // Count active users (is_active = TRUE) for this tenant
    // Real-time sync only makes sense when there are multiple users to sync with
    const result = await db.query(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE tenant_id = $1 AND is_active = TRUE`,
      [tenantId]
    );

    const activeUserCount = parseInt(result[0]?.count || '0', 10);
    const shouldEnableSync = activeUserCount >= 2;

    res.json({
      shouldEnableSync,
      userCount: activeUserCount
    });
  } catch (error) {
    console.error('Error checking if sync should be enabled:', error);
    res.status(500).json({ error: 'Failed to check sync status' });
  }
});

// Get online user count for the organization (users with active sessions)
router.get('/online-users-count', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;

    // Count users with login_status = true for this tenant
    // A user is considered online if their login_status flag is true
    const result = await db.query(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE tenant_id = $1 AND login_status = TRUE AND is_active = TRUE`,
      [tenantId]
    );

    const onlineUsers = parseInt(result[0]?.count || '0', 10);

    res.json({ onlineUsers });
  } catch (error) {
    console.error('Error fetching online users count:', error);
    res.status(500).json({ error: 'Failed to fetch online users count' });
  }
});

// Get list of online users for the organization
router.get('/online-users', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;

    // Get users with login_status = true for this tenant
    // A user is considered online if their login_status flag is true
    const users = await db.query(
      `SELECT u.id, u.username, u.name, u.role, u.email
       FROM users u
       WHERE u.tenant_id = $1 AND u.login_status = TRUE AND u.is_active = TRUE
       ORDER BY u.name`,
      [tenantId]
    );

    res.json(users);
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({ error: 'Failed to fetch online users' });
  }
});

// Send chat message (relays via WebSocket, not stored in cloud DB)
router.post('/chat/send', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const senderId = req.userId!;
    const { recipientId, message } = req.body;

    if (!recipientId || !message || !message.trim()) {
      return res.status(400).json({ error: 'Recipient ID and message are required' });
    }

    // Verify recipient exists and is in same tenant
    const db = getDb();
    const recipient = await db.query(
      'SELECT id, name FROM users WHERE id = $1 AND tenant_id = $2',
      [recipientId, tenantId]
    );

    if (recipient.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Get sender info
    const sender = await db.query(
      'SELECT id, name FROM users WHERE id = $1 AND tenant_id = $2',
      [senderId, tenantId]
    );

    if (sender.length === 0) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    // Generate unique message ID with better collision prevention
    // Use high-resolution time and multiple random components
    const timestamp = Date.now();
    const random1 = Math.random().toString(36).substring(2, 11);
    const random2 = Math.random().toString(36).substring(2, 11);
    const messageId = `chat_${timestamp}_${random1}_${random2}`;

    const messageData = {
      id: messageId,
      senderId: senderId,
      senderName: sender[0].name,
      recipientId: recipientId,
      recipientName: recipient[0].name,
      message: message.trim(),
      createdAt: new Date().toISOString()
    };

    // Emit to specific user via WebSocket (not stored in cloud DB)
    const wsService = getWebSocketService();
    wsService.emitToUser(tenantId, recipientId, WS_EVENTS.CHAT_MESSAGE, messageData);

    // Also emit to sender for confirmation (optional, but helps with UI updates)
    wsService.emitToUser(tenantId, senderId, WS_EVENTS.CHAT_MESSAGE, messageData);

    res.json({ success: true, message: messageData });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;

