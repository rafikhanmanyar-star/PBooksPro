import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getWhatsAppApiService } from '../../services/whatsappApiService.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * GET /api/whatsapp/config
 * Get current tenant's WhatsApp configuration
 */
router.get('/config', async (req: TenantRequest, res) => {
  try {
    console.log('[WhatsApp Config] GET /config request received', {
      tenantId: req.tenantId,
    });

    if (!req.tenantId) {
      console.error('[WhatsApp Config] Missing tenantId in request');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant ID is required',
      });
    }

    const whatsappService = getWhatsAppApiService();
    const config = await whatsappService.getConfig(req.tenantId);

    if (!config) {
      console.log('[WhatsApp Config] No configuration found for tenant:', req.tenantId);
      return res.status(404).json({ error: 'WhatsApp API not configured' });
    }

    // Return config without sensitive data (API key is not included in response)
    res.json({
      id: config.id,
      tenantId: config.tenantId,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      webhookUrl: config.webhookUrl,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch (error: any) {
    console.error('Error getting WhatsApp config:', error);
    res.status(500).json({ error: 'Failed to get WhatsApp configuration' });
  }
});

/**
 * POST /api/whatsapp/config
 * Create or update WhatsApp configuration
 */
router.post('/config', async (req: TenantRequest, res) => {
  try {
    // Log request for debugging
    console.log('[WhatsApp Config] POST /config request received', {
      tenantId: req.tenantId,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });

    if (!req.tenantId) {
      console.error('[WhatsApp Config] Missing tenantId in request');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant ID is required',
      });
    }

    const { apiKey, apiSecret, phoneNumberId, businessAccountId, verifyToken, webhookUrl } = req.body;

    // Validate required fields
    if (!apiKey || !phoneNumberId || !verifyToken) {
      console.error('[WhatsApp Config] Missing required fields', {
        hasApiKey: !!apiKey,
        hasPhoneNumberId: !!phoneNumberId,
        hasVerifyToken: !!verifyToken,
      });
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'apiKey, phoneNumberId, and verifyToken are required',
      });
    }

    const whatsappService = getWhatsAppApiService();

    // Save configuration
    const config = await whatsappService.saveConfig(req.tenantId!, {
      apiKey,
      apiSecret,
      phoneNumberId,
      businessAccountId,
      verifyToken,
      webhookUrl,
    });

    // Return config without sensitive data
    console.log('[WhatsApp Config] Configuration saved successfully', {
      tenantId: config.tenantId,
      phoneNumberId: config.phoneNumberId,
    });
    
    res.json({
      id: config.id,
      tenantId: config.tenantId,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      webhookUrl: config.webhookUrl,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch (error: any) {
    console.error('[WhatsApp Config] Error saving configuration:', error);
    console.error('[WhatsApp Config] Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to save WhatsApp configuration',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/whatsapp/config
 * Delete/disconnect WhatsApp configuration
 */
router.delete('/config', async (req: TenantRequest, res) => {
  try {
    const whatsappService = getWhatsAppApiService();
    await whatsappService.deleteConfig(req.tenantId!);
    res.json({ success: true, message: 'WhatsApp configuration deleted' });
  } catch (error: any) {
    console.error('Error deleting WhatsApp config:', error);
    res.status(500).json({ error: 'Failed to delete WhatsApp configuration' });
  }
});

/**
 * POST /api/whatsapp/test-connection
 * Test WhatsApp API connection
 */
router.post('/test-connection', async (req: TenantRequest, res) => {
  try {
    const whatsappService = getWhatsAppApiService();
    const isConnected = await whatsappService.testConnection(req.tenantId!);
    
    if (isConnected) {
      res.json({ success: true, message: 'Connection successful' });
    } else {
      res.status(400).json({ success: false, message: 'Connection failed' });
    }
  } catch (error: any) {
    console.error('Error testing WhatsApp connection:', error);
    res.status(500).json({
      error: 'Failed to test connection',
      message: error.message,
    });
  }
});

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message
 */
router.post('/send', async (req: TenantRequest, res) => {
  try {
    const { contactId, phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'phoneNumber and message are required',
      });
    }

    const whatsappService = getWhatsAppApiService();
    const result = await whatsappService.sendTextMessage(
      req.tenantId!,
      phoneNumber,
      message,
      contactId
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: error.message,
    });
  }
});

/**
 * GET /api/whatsapp/messages
 * Get message history
 */
router.get('/messages', async (req: TenantRequest, res) => {
  try {
    const { contactId, phoneNumber, limit, offset } = req.query;

    const whatsappService = getWhatsAppApiService();
    const messages = await whatsappService.getMessages(req.tenantId!, {
      contactId: contactId as string,
      phoneNumber: phoneNumber as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(messages);
  } catch (error: any) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * GET /api/whatsapp/messages/:messageId/status
 * Get message status
 */
router.get('/messages/:messageId/status', async (req: TenantRequest, res) => {
  try {
    const { messageId } = req.params;

    const db = getDb();
    const messages = await db.query(
      `SELECT status, timestamp, read_at FROM whatsapp_messages
       WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, messageId]
    );

    if (messages.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(messages[0]);
  } catch (error: any) {
    console.error('Error getting message status:', error);
    res.status(500).json({ error: 'Failed to get message status' });
  }
});

/**
 * POST /api/whatsapp/messages/:messageId/read
 * Mark message as read
 */
router.post('/messages/:messageId/read', async (req: TenantRequest, res) => {
  try {
    const { messageId } = req.params;

    const whatsappService = getWhatsAppApiService();
    await whatsappService.markAsRead(req.tenantId!, messageId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

/**
 * POST /api/whatsapp/messages/read-all
 * Mark all messages from a phone number as read
 */
router.post('/messages/read-all', async (req: TenantRequest, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    const whatsappService = getWhatsAppApiService();
    await whatsappService.markAllAsRead(req.tenantId!, phoneNumber);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking all messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

/**
 * GET /api/whatsapp/unread-count
 * Get count of unread messages
 */
router.get('/unread-count', async (req: TenantRequest, res) => {
  try {
    const whatsappService = getWhatsAppApiService();
    const count = await whatsappService.getUnreadCount(req.tenantId!);
    res.json({ count });
  } catch (error: any) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

export default router;
