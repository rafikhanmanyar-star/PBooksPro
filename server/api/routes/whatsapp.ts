import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getWhatsAppApiService } from '../../services/whatsappApiService.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();
const DEBUG_WHATSAPP = process.env.DEBUG_WHATSAPP === 'true';

/**
 * GET /api/whatsapp/config
 * Get current tenant's WhatsApp configuration
 */
router.get('/config', async (req: TenantRequest, res) => {
  try {
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
      // Return 200 with configured: false instead of 404
      // This is a valid state - tenant simply hasn't configured WhatsApp yet
      return res.status(200).json({ 
        configured: false,
        message: 'WhatsApp API not configured yet'
      });
    }

    // Return config without sensitive data (API key is not included in response)
    res.json({
      configured: true,
      id: config.id,
      tenantId: config.tenantId,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      webhookUrl: config.webhookUrl,
      verifyToken: config.verifyToken, // Include verify token (non-sensitive, needed for setup)
      isActive: config.isActive,
      hasApiKey: !!config.apiKey, // Flag to indicate API key exists (don't send actual key)
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
    if (!req.tenantId) {
      console.error('[WhatsApp Config] Missing tenantId in request');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant ID is required',
      });
    }

    const { apiKey, apiSecret, phoneNumberId, businessAccountId, verifyToken, webhookUrl } = req.body;

    // Check if updating existing config
    const whatsappService = getWhatsAppApiService();
    const existingConfig = await whatsappService.getConfig(req.tenantId);

    // Validate required fields
    // API key is optional if config already exists (keeps existing key)
    if (!existingConfig && !apiKey) {
      console.error('[WhatsApp Config] Missing API key for new configuration');
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'apiKey is required for new configuration',
      });
    }

    if (!phoneNumberId || !verifyToken) {
      console.error('[WhatsApp Config] Missing required fields', {
        hasPhoneNumberId: !!phoneNumberId,
        hasVerifyToken: !!verifyToken,
      });
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'phoneNumberId and verifyToken are required',
      });
    }

    // Save configuration
    const config = await whatsappService.saveConfig(req.tenantId!, {
      apiKey: apiKey || undefined, // undefined = keep existing
      apiSecret,
      phoneNumberId,
      businessAccountId,
      verifyToken,
      webhookUrl,
    });

    // Return config without sensitive data
    if (DEBUG_WHATSAPP) console.log('[WhatsApp Config] Configuration saved successfully', {
      tenantId: config.tenantId,
      phoneNumberId: config.phoneNumberId,
    });
    
    res.json({
      configured: true,
      id: config.id,
      tenantId: config.tenantId,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      webhookUrl: config.webhookUrl,
      verifyToken: config.verifyToken,
      isActive: config.isActive,
      hasApiKey: !!config.apiKey,
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
  const requestId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  
  try {
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Test Connection] [${requestId}] Request received`, {
      tenantId: req.tenantId,
      timestamp: new Date().toISOString(),
    });

    if (!req.tenantId) {
      console.error(`[WhatsApp Test Connection] [${requestId}] Missing tenantId`, {
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Tenant ID is required',
      });
    }

    const whatsappService = getWhatsAppApiService();
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Test Connection] [${requestId}] Calling testConnection service`, {
      tenantId: req.tenantId,
    });
    
    const result = await whatsappService.testConnection(req.tenantId!);
    
    const duration = Date.now() - startTime;
    
    if (result.ok) {
      if (DEBUG_WHATSAPP) console.log(`[WhatsApp Test Connection] [${requestId}] Connection test successful`, {
        tenantId: req.tenantId,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.json({ success: true, message: 'Connection successful' });
    } else {
      console.error(`[WhatsApp Test Connection] [${requestId}] Connection test failed`, {
        tenantId: req.tenantId,
        error: result.error,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.status(400).json({
        success: false,
        message: result.error || 'Connection failed',
      });
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[WhatsApp Test Connection] [${requestId}] Error testing connection`, {
      tenantId: req.tenantId,
      error: error.message,
      errorStack: error.stack?.substring(0, 500),
      errorResponse: error.response?.data || null,
      errorStatus: error.response?.status || null,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
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
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  
  // Log immediately when route handler is called
  if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] ===== ROUTE HANDLER CALLED =====`, {
    method: req.method,
    path: req.path,
    url: req.url,
    tenantId: req.tenantId || 'MISSING',
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? 'Bearer ***' : 'missing',
      'user-agent': req.headers['user-agent']?.substring(0, 50),
    },
    timestamp: new Date().toISOString(),
  });
  
  try {
    // Validate tenant ID first
    if (!req.tenantId) {
      console.error(`[WhatsApp Send] [${requestId}] ❌ MISSING TENANT ID - Request blocked`, {
        hasAuthHeader: !!req.headers['authorization'],
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant ID is required',
      });
    }

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] Request validated - tenant ID present`, {
      tenantId: req.tenantId,
      hasPhoneNumber: !!req.body?.phoneNumber,
      hasMessage: !!req.body?.message,
      phoneNumber: req.body?.phoneNumber ? req.body.phoneNumber.substring(0, 5) + '***' : 'missing',
      messageLength: req.body?.message?.length || 0,
      contactId: req.body?.contactId || null,
      fullBody: JSON.stringify(req.body).substring(0, 200),
      timestamp: new Date().toISOString(),
    });

    const { contactId, phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      console.error(`[WhatsApp Send] [${requestId}] ❌ Missing required fields`, {
        hasPhoneNumber: !!phoneNumber,
        hasMessage: !!message,
        bodyKeys: Object.keys(req.body || {}),
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'phoneNumber and message are required',
      });
    }

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] ✅ Fields validated, calling sendTextMessage service`, {
      tenantId: req.tenantId,
      phoneNumber: phoneNumber.substring(0, 5) + '***',
      phoneNumberLength: phoneNumber.length,
      messageLength: message.length,
      messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      contactId: contactId || null,
      timestamp: new Date().toISOString(),
    });

    const whatsappService = getWhatsAppApiService();
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] Service instance obtained, calling sendTextMessage`, {
      timestamp: new Date().toISOString(),
    });
    
    const result = await whatsappService.sendTextMessage(
      req.tenantId!,
      phoneNumber,
      message,
      contactId
    );

    const duration = Date.now() - startTime;
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] ✅✅✅ MESSAGE SENT SUCCESSFULLY ✅✅✅`, {
      messageId: result.messageId,
      wamId: result.wamId,
      status: result.status,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] Sending success response to client`, {
      responseData: JSON.stringify(result).substring(0, 200),
      timestamp: new Date().toISOString(),
    });

    res.json(result);
    
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send] [${requestId}] ✅ Response sent to client`, {
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[WhatsApp Send] [${requestId}] ❌❌❌ ERROR SENDING MESSAGE ❌❌❌`, {
      errorType: error.constructor?.name || typeof error,
      errorMessage: error.message,
      errorStack: error.stack?.substring(0, 1000),
      errorCode: error.code,
      errorResponse: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: JSON.stringify(error.response.data).substring(0, 1000),
        headers: error.response.headers ? Object.keys(error.response.headers) : [],
      } : null,
      errorRequest: error.config ? {
        url: error.config.url,
        method: error.config.method,
        baseURL: error.config.baseURL,
        hasData: !!error.config.data,
        dataPreview: error.config.data ? JSON.stringify(error.config.data).substring(0, 200) : null,
      } : null,
      tenantId: req.tenantId || 'MISSING',
      phoneNumber: req.body?.phoneNumber ? req.body.phoneNumber.substring(0, 5) + '***' : 'missing',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to send message';
    
    console.error(`[WhatsApp Send] [${requestId}] Sending error response to client`, {
      statusCode,
      errorMessage,
      timestamp: new Date().toISOString(),
    });
    
    res.status(statusCode).json({
      error: 'Failed to send message',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/whatsapp/messages
 * Get message history
 */
router.get('/messages', async (req: TenantRequest, res) => {
  const requestId = `get_msgs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    const { contactId, phoneNumber, limit, offset } = req.query;

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Messages] [${requestId}] Getting messages`, {
      tenantId: req.tenantId,
      contactId: contactId || null,
      phoneNumber: phoneNumber ? (phoneNumber as string).substring(0, 5) + '***' : null,
      limit: limit || 'none',
      offset: offset || 0,
      timestamp: new Date().toISOString(),
    });

    const whatsappService = getWhatsAppApiService();
    const messages = await whatsappService.getMessages(req.tenantId!, {
      contactId: contactId as string,
      phoneNumber: phoneNumber as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Messages] [${requestId}] ✅ Messages retrieved`, {
      count: messages.length,
      hasIncoming: messages.some(m => m.direction === 'incoming'),
      hasOutgoing: messages.some(m => m.direction === 'outgoing'),
      timestamp: new Date().toISOString(),
    });

    // Transform database fields (snake_case) to camelCase for frontend
    const transformed = messages.map((msg: any) => ({
      id: msg.id,
      tenantId: msg.tenant_id || msg.tenantId,
      contactId: msg.contact_id || msg.contactId,
      phoneNumber: msg.phone_number || msg.phoneNumber,
      messageId: msg.message_id || msg.messageId,
      wamId: msg.wam_id || msg.wamId,
      direction: msg.direction,
      status: msg.status,
      messageText: msg.message_text || msg.messageText,
      mediaUrl: msg.media_url || msg.mediaUrl,
      mediaType: msg.media_type || msg.mediaType,
      mediaCaption: msg.media_caption || msg.mediaCaption,
      timestamp: msg.timestamp,
      createdAt: msg.created_at || msg.createdAt,
      readAt: msg.read_at || msg.readAt,
    }));

    res.json(transformed);
  } catch (error: any) {
    console.error(`[WhatsApp Messages] [${requestId}] ❌ Error getting messages`, {
      error: error.message,
      errorStack: error.stack?.substring(0, 500),
      tenantId: req.tenantId,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * GET /api/whatsapp/messages/:messageId/status
 * Get message status from database
 */
router.get('/messages/:messageId/status', async (req: TenantRequest, res) => {
  const requestId = `status_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    const { messageId } = req.params;

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Status] [${requestId}] Getting message status`, {
      messageId,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString(),
    });

    const db = getDb();
    const messages = await db.query(
      `SELECT id, status, timestamp, read_at, message_id, wam_id, phone_number, direction, message_text 
       FROM whatsapp_messages
       WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, messageId]
    );

    if (messages.length === 0) {
      console.warn(`[WhatsApp Status] [${requestId}] Message not found in database`, {
        messageId,
        tenantId: req.tenantId,
      });
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = messages[0];
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Status] [${requestId}] Message status retrieved`, {
      messageId,
      status: message.status,
      wamId: message.wam_id || message.message_id,
      phoneNumber: message.phone_number?.substring(0, 5) + '***',
      direction: message.direction,
      timestamp: message.timestamp,
      readAt: message.read_at,
    });

    res.json({
      id: message.id,
      status: message.status,
      timestamp: message.timestamp,
      readAt: message.read_at,
      wamId: message.wam_id || message.message_id,
      phoneNumber: message.phone_number?.substring(0, 5) + '***',
      direction: message.direction,
    });
  } catch (error: any) {
    console.error(`[WhatsApp Status] [${requestId}] Error getting message status`, {
      error: error.message,
      errorStack: error.stack?.substring(0, 500),
      messageId: req.params.messageId,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: 'Failed to get message status' });
  }
});

/**
 * GET /api/whatsapp/messages/:messageId/check-meta
 * Check message status directly from Meta API
 */
router.get('/messages/:messageId/check-meta', async (req: TenantRequest, res) => {
  const requestId = `check_meta_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    const { messageId } = req.params;

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Meta Check] [${requestId}] Checking message status from Meta API`, {
      messageId,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString(),
    });

    // Get message from database to get WAM ID
    const db = getDb();
    const messages = await db.query(
      `SELECT wam_id, message_id, phone_number, status FROM whatsapp_messages
       WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, messageId]
    );

    if (messages.length === 0) {
      return res.status(404).json({ error: 'Message not found in database' });
    }

    const dbMessage = messages[0];
    const wamId = dbMessage.wam_id || dbMessage.message_id;

    if (!wamId) {
      return res.status(400).json({ error: 'No WAM ID found for this message' });
    }

    // Get config and check status from Meta
    const whatsappService = getWhatsAppApiService();
    const config = await whatsappService.getConfig(req.tenantId!);
    
    if (!config) {
      return res.status(404).json({ error: 'WhatsApp not configured' });
    }

    // Note: Meta doesn't have a direct status check endpoint for individual messages
    // Status updates come via webhooks. We'll return what we know from database.
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Meta Check] [${requestId}] Message info retrieved`, {
      wamId,
      dbStatus: dbMessage.status,
      phoneNumber: dbMessage.phone_number?.substring(0, 5) + '***',
      note: 'Meta API doesn\'t provide direct status check. Status updates come via webhooks.',
    });

    res.json({
      wamId,
      databaseStatus: dbMessage.status,
      phoneNumber: dbMessage.phone_number?.substring(0, 5) + '***',
      note: 'Meta API doesn\'t provide direct status check endpoint. Status updates are delivered via webhooks. Check Meta Business Suite dashboard for delivery status.',
      webhookStatus: dbMessage.status,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[WhatsApp Meta Check] [${requestId}] Error checking Meta status`, {
      error: error.message,
      errorStack: error.stack?.substring(0, 500),
      messageId: req.params.messageId,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: 'Failed to check message status from Meta' });
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
 * Note: No config check needed - this is a local DB operation
 */
router.post('/messages/read-all', async (req: TenantRequest, res) => {
  try {
    const { phoneNumber, contactId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    if (!req.tenantId) {
      return res.status(401).json({ error: 'Tenant ID is required' });
    }

    const whatsappService = getWhatsAppApiService();

    // Pass contactId if provided to ensure we only mark messages for this specific contact
    await whatsappService.markAllAsRead(req.tenantId, phoneNumber, contactId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking all messages as read:', error);
    // Return success even on error to prevent UI alerts - this is not critical
    res.json({ success: true, error: error.message });
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

/**
 * GET /api/whatsapp/unread-conversations
 * Get unread conversations grouped by phone number
 */
router.get('/unread-conversations', async (req: TenantRequest, res) => {
  try {
    const whatsappService = getWhatsAppApiService();
    const conversations = await whatsappService.getUnreadConversations(req.tenantId!);
    res.json(conversations);
  } catch (error: any) {
    console.error('Error getting unread conversations:', error);
    res.status(500).json({ error: 'Failed to get unread conversations' });
  }
});

/**
 * POST /api/whatsapp/send-document
 * Send a document (PDF/image) via WhatsApp
 */
router.post('/send-document', async (req: TenantRequest, res) => {
  const requestId = `send_doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  
  try {
    if (!req.tenantId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant ID is required',
      });
    }

    const { contactId, phoneNumber, documentUrl, filename, caption } = req.body;

    if (!phoneNumber || !documentUrl || !filename) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'phoneNumber, documentUrl, and filename are required',
      });
    }

    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send Document] [${requestId}] Sending document`, {
      tenantId: req.tenantId,
      phoneNumber: phoneNumber.substring(0, 5) + '***',
      filename,
      hasCaption: !!caption,
      timestamp: new Date().toISOString(),
    });

    const whatsappService = getWhatsAppApiService();
    const result = await whatsappService.sendDocumentMessage(
      req.tenantId!,
      phoneNumber,
      documentUrl,
      filename,
      caption,
      contactId
    );

    const duration = Date.now() - startTime;
    if (DEBUG_WHATSAPP) console.log(`[WhatsApp Send Document] [${requestId}] ✅ Document sent successfully`, {
      messageId: result.messageId,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[WhatsApp Send Document] [${requestId}] ❌ Error sending document`, {
      error: error.message,
      errorStack: error.stack?.substring(0, 1000),
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to send document';
    
    res.status(statusCode).json({
      error: 'Failed to send document',
      message: errorMessage,
    });
  }
});

export default router;
