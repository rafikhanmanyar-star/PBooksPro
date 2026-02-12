import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { getDatabaseService } from './databaseService.js';
import { encryptionService } from './encryptionService.js';
import { emitToTenant, WS_EVENTS } from './websocketHelper.js';

/**
 * WhatsApp Business API Service
 * Handles integration with Meta WhatsApp Business Cloud API
 */

const DEBUG_WHATSAPP = process.env.DEBUG_WHATSAPP === 'true';

export interface WhatsAppConfig {
  id: string;
  tenantId: string;
  apiKey: string; // Decrypted access token
  apiSecret?: string;
  phoneNumberId: string;
  businessAccountId?: string;
  verifyToken: string;
  webhookUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhatsAppMessage {
  id: string;
  tenantId: string;
  contactId?: string;
  phoneNumber: string;
  messageId?: string;
  wamId?: string;
  direction: 'outgoing' | 'incoming';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  messageText: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaCaption?: string;
  timestamp: Date;
  createdAt: Date;
  readAt?: Date;
}

export interface SendMessageResponse {
  messageId: string;
  wamId: string;
  status: 'sent';
}

export interface MessageStatusResponse {
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: Date;
}

/**
 * WhatsApp API Service Class
 */
export class WhatsAppApiService {
  private db = getDatabaseService();
  private readonly apiBaseUrl = process.env.META_GRAPH_URL || 'https://graph.facebook.com';
  private readonly apiVersion = process.env.META_API_VERSION || 'v21.0';

  /**
   * Get WhatsApp configuration for a tenant
   */
  async getConfig(tenantId: string): Promise<WhatsAppConfig | null> {
    try {
      const configs = await this.db.query<WhatsAppConfig>(
        'SELECT * FROM whatsapp_configs WHERE tenant_id = $1 AND is_active = TRUE',
        [tenantId]
      );

      if (configs.length === 0) {
        return null;
      }

      const config = configs[0] as any; // Database returns snake_case

      // Decrypt API key
      const decryptedApiKey = encryptionService.decrypt(config.api_key);
      const decryptedApiSecret = config.api_secret
        ? encryptionService.decrypt(config.api_secret)
        : undefined;

      return {
        id: config.id,
        tenantId: config.tenant_id,
        apiKey: decryptedApiKey,
        apiSecret: decryptedApiSecret,
        phoneNumberId: config.phone_number_id,
        businessAccountId: config.business_account_id || undefined,
        verifyToken: config.verify_token,
        webhookUrl: config.webhook_url || undefined,
        isActive: config.is_active,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      };
    } catch (error) {
      console.error('Error getting WhatsApp config:', error);
      throw error;
    }
  }

  /**
   * Save WhatsApp configuration for a tenant
   */
  async saveConfig(
    tenantId: string,
    configData: {
      apiKey?: string; // Optional when updating existing config
      apiSecret?: string;
      phoneNumberId: string;
      businessAccountId?: string;
      verifyToken: string;
      webhookUrl?: string;
    }
  ): Promise<WhatsAppConfig> {
    try {
      // Check if config exists
      const existing = await this.db.query(
        'SELECT id, api_key, api_secret FROM whatsapp_configs WHERE tenant_id = $1',
        [tenantId]
      );

      const configId = existing.length > 0
        ? existing[0].id
        : `whatsapp_config_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Use existing keys if not provided (for updates)
      const apiKeyToUse = configData.apiKey || (existing.length > 0 ? existing[0].api_key : null);
      const apiSecretToUse = configData.apiSecret !== undefined 
        ? (configData.apiSecret ? encryptionService.encrypt(configData.apiSecret) : null)
        : (existing.length > 0 ? existing[0].api_secret : null);

      if (!apiKeyToUse) {
        throw new Error('API key is required for new configuration');
      }

      // Encrypt API key if it's a new one (not from existing config)
      const encryptedApiKey = configData.apiKey 
        ? encryptionService.encrypt(configData.apiKey)
        : apiKeyToUse;

      if (existing.length > 0) {
        // Update existing config
        await this.db.query(
          `UPDATE whatsapp_configs
           SET api_key = $1,
               api_secret = $2,
               phone_number_id = $3,
               business_account_id = $4,
               verify_token = $5,
               webhook_url = $6,
               is_active = TRUE,
               updated_at = NOW()
           WHERE tenant_id = $7`,
          [
            encryptedApiKey,
            apiSecretToUse,
            configData.phoneNumberId,
            configData.businessAccountId || null,
            configData.verifyToken,
            configData.webhookUrl || null,
            tenantId,
          ]
        );
      } else {
        // Insert new config
        await this.db.query(
          `INSERT INTO whatsapp_configs (
            id, tenant_id, api_key, api_secret, phone_number_id,
            business_account_id, verify_token, webhook_url, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
          [
            configId,
            tenantId,
            encryptedApiKey,
            apiSecretToUse,
            configData.phoneNumberId,
            configData.businessAccountId || null,
            configData.verifyToken,
            configData.webhookUrl || null,
          ]
        );
      }

      // Return decrypted config
      const savedConfig = await this.getConfig(tenantId);
      if (!savedConfig) {
        throw new Error('Failed to retrieve saved configuration');
      }

      return savedConfig;
    } catch (error) {
      console.error('Error saving WhatsApp config:', error);
      throw error;
    }
  }

  /**
   * Delete/disconnect WhatsApp configuration
   */
  async deleteConfig(tenantId: string): Promise<void> {
    try {
      await this.db.query(
        'UPDATE whatsapp_configs SET is_active = FALSE, updated_at = NOW() WHERE tenant_id = $1',
        [tenantId]
      );
    } catch (error) {
      console.error('Error deleting WhatsApp config:', error);
      throw error;
    }
  }

  /**
   * Create axios instance for API requests
   */
  private createApiClient(config: WhatsAppConfig): AxiosInstance {
    return axios.create({
      baseURL: `${this.apiBaseUrl}/${this.apiVersion}`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a text message via WhatsApp API
   */
  async sendTextMessage(
    tenantId: string,
    phoneNumber: string,
    message: string,
    contactId?: string
  ): Promise<SendMessageResponse> {
    const requestId = `send_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    
    const config = await this.getConfig(tenantId);
    if (!config) {
      console.error(`[WhatsApp API Service] [${requestId}] ❌ NO CONFIGURATION FOUND FOR TENANT`, {
        tenantId,
        timestamp: new Date().toISOString(),
      });
      throw new Error('WhatsApp API not configured for this tenant');
    }

    try {
      // Format phone number (remove non-numeric, add country code if needed)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const apiClient = this.createApiClient(config);
      const apiUrl = `/${config.phoneNumberId}/messages`;
      const requestPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      };

      const response = await apiClient.post(apiUrl, requestPayload);

      const fullResponseData = JSON.stringify(response.data);

      // Check for warnings or errors in Meta response
      if (response.data?.error) {
        console.error(`[WhatsApp API Service] [${requestId}] ⚠️ META API RETURNED ERROR IN RESPONSE`, {
          errorCode: response.data.error.code,
          errorType: response.data.error.type,
          errorMessage: response.data.error.message,
          errorSubcode: response.data.error.error_subcode,
          fullError: JSON.stringify(response.data.error),
          timestamp: new Date().toISOString(),
        });
      }

      if (!response.data || !response.data.messages || response.data.messages.length === 0) {
        console.error(`[WhatsApp API Service] [${requestId}] ❌ INVALID RESPONSE FROM META API`, {
          hasData: !!response.data,
          hasMessages: !!(response.data && response.data.messages),
          messageCount: response.data?.messages?.length || 0,
          responseData: fullResponseData,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Invalid response from Meta API: no message ID returned');
      }

      const messageId = response.data.messages[0].id;

      // Save message to database
      const dbMessageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await this.db.query(
        `INSERT INTO whatsapp_messages (
          id, tenant_id, contact_id, phone_number, message_id, wam_id,
          direction, status, message_text, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, 'outgoing', 'sent', $7, NOW())`,
        [
          dbMessageId,
          tenantId,
          contactId || null,
          formattedPhone,
          messageId,
          messageId, // wam_id same as message_id for outgoing
          message,
        ]
      );

      // Emit WebSocket event for WhatsApp message sent
      emitToTenant(tenantId, WS_EVENTS.WHATSAPP_MESSAGE_SENT, {
        id: dbMessageId,
        tenantId,
        contactId,
        phoneNumber: formattedPhone,
        messageId,
        wamId: messageId,
        direction: 'outgoing',
        status: 'sent',
        messageText: message,
        timestamp: new Date(),
      });

      return {
        messageId: dbMessageId,
        wamId: messageId,
        status: 'sent',
      };
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      console.error(`[WhatsApp API Service] [${requestId}] Error sending WhatsApp message`, {
        error: error.message,
        errorCode: error.code,
        errorStack: error.stack?.substring(0, 500),
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
        } : null,
        totalDuration: `${totalDuration}ms`,
        timestamp: new Date().toISOString(),
      });
      
      // Save failed message to database
      const dbMessageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      try {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        await this.db.query(
          `INSERT INTO whatsapp_messages (
            id, tenant_id, contact_id, phone_number,
            direction, status, message_text, timestamp
          ) VALUES ($1, $2, $3, $4, 'outgoing', 'failed', $5, NOW())`,
          [dbMessageId, tenantId, contactId || null, formattedPhone, message]
        );
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${requestId}] Failed message saved to database`, {
          dbMessageId,
        });
      } catch (dbError: any) {
        console.error(`[WhatsApp API Service] [${requestId}] Error saving failed message to database`, {
          dbError: dbError.message,
          dbErrorStack: dbError.stack?.substring(0, 500),
        });
      }

      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to send WhatsApp message';
      throw new Error(errorMessage);
    }
  }

  /**
   * Send a document (PDF/image) message via WhatsApp API
   */
  async sendDocumentMessage(
    tenantId: string,
    phoneNumber: string,
    documentUrl: string,
    filename: string,
    caption?: string,
    contactId?: string
  ): Promise<SendMessageResponse> {
    const requestId = `send_doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${requestId}] ===== sendDocumentMessage CALLED =====`, {
      tenantId: tenantId || 'MISSING',
      phoneNumber: phoneNumber ? phoneNumber.substring(0, 5) + '***' : 'MISSING',
      documentUrl: documentUrl ? documentUrl.substring(0, 50) + '...' : 'MISSING',
      filename,
      hasCaption: !!caption,
      captionLength: caption?.length || 0,
      contactId: contactId || null,
      timestamp: new Date().toISOString(),
    });

    const config = await this.getConfig(tenantId);
    if (!config) {
      console.error(`[WhatsApp API Service] [${requestId}] ❌ NO CONFIGURATION FOUND FOR TENANT`, {
        tenantId,
        timestamp: new Date().toISOString(),
      });
      throw new Error('WhatsApp API not configured for this tenant');
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const apiClient = this.createApiClient(config);
      const apiUrl = `/${config.phoneNumberId}/messages`;
      
      const requestPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'document',
        document: {
          link: documentUrl,
          filename: filename,
          caption: caption || undefined,
        },
      };

      const fullUrl = `${this.apiBaseUrl}/${this.apiVersion}${apiUrl}`;
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${requestId}] ===== CALLING META API FOR DOCUMENT =====`, {
        method: 'POST',
        url: fullUrl,
        phoneNumberId: config.phoneNumberId,
        recipient: formattedPhone.substring(0, 5) + '***',
        filename,
        timestamp: new Date().toISOString(),
      });

      const response = await apiClient.post(apiUrl, requestPayload);

      const apiDuration = Date.now() - startTime;
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${requestId}] ✅ HTTP Response received from Meta`, {
        status: response.status,
        hasData: !!response.data,
        hasMessages: !!(response.data && response.data.messages),
        duration: `${apiDuration}ms`,
        timestamp: new Date().toISOString(),
      });

      if (!response.data || !response.data.messages || response.data.messages.length === 0) {
        throw new Error('Invalid response from Meta API: no message ID returned');
      }

      const messageId = response.data.messages[0].id;
      
      // Save message to database
      const dbMessageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await this.db.query(
        `INSERT INTO whatsapp_messages (
          id, tenant_id, contact_id, phone_number, message_id, wam_id,
          direction, status, message_text, media_url, media_type, media_caption, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, 'outgoing', 'sent', $7, $8, 'document', $9, NOW())`,
        [
          dbMessageId,
          tenantId,
          contactId || null,
          formattedPhone,
          messageId,
          messageId,
          caption || '',
          documentUrl,
          caption || null,
        ]
      );

      const duration = Date.now() - startTime;
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${requestId}] ✅✅✅ DOCUMENT MESSAGE SENT SUCCESSFULLY ✅✅✅`, {
        messageId,
        wamId: messageId,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return {
        messageId,
        wamId: messageId,
        status: 'sent',
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp API Service] [${requestId}] ❌❌❌ ERROR SENDING DOCUMENT MESSAGE ❌❌❌`, {
        error: error.message,
        errorStack: error.stack?.substring(0, 1000),
        errorResponse: error.response?.data || null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Format phone number for WhatsApp API (same as normalizePhoneForWhatsApp).
   * Kept for backward compatibility with send flow.
   */
  private formatPhoneNumber(phoneNumber: string): string {
    return this.normalizePhoneForWhatsApp(phoneNumber);
  }

  /**
   * Normalize phone to canonical form for storage and lookup.
   * Meta uses full international (e.g. 919876543210). We store the same so
   * incoming (message.from) and outgoing (recipient) match when querying.
   * - Strips non-numeric, removes leading 0.
   * - If 10 digits, prepends defaultCountryCode (91) so it matches Meta's from.
   */
  private normalizePhoneForWhatsApp(phoneNumber: string, defaultCountryCode = '91'): string {
    let cleaned = (phoneNumber || '').replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.length < 10) throw new Error('Invalid phone number format');
    if (cleaned.length === 10 && defaultCountryCode && !cleaned.startsWith(defaultCountryCode)) {
      cleaned = defaultCountryCode + cleaned;
    }
    return cleaned;
  }

  /** Digits-only form (no country prefix). Used for backward-compat lookup. */
  private digitsOnlyPhone(phoneNumber: string, defaultCountryCode = '91'): string {
    let cleaned = (phoneNumber || '').replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.length >= 12 && cleaned.startsWith(defaultCountryCode)) {
      cleaned = cleaned.substring(defaultCountryCode.length);
    }
    return cleaned.length >= 10 ? cleaned : '';
  }

  /**
   * Get verify token for a tenant (for webhook verification)
   */
  async getVerifyToken(tenantId: string): Promise<string | null> {
    try {
      const configs = await this.db.query<{ verify_token: string }>(
        'SELECT verify_token FROM whatsapp_configs WHERE tenant_id = $1 AND is_active = TRUE',
        [tenantId]
      );

      return configs.length > 0 ? configs[0].verify_token : null;
    } catch (error) {
      console.error('Error getting verify token:', error);
      return null;
    }
  }

  /**
   * Process incoming webhook event
   */
  async processWebhook(tenantId: string, payload: any): Promise<void> {
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] Processing webhook`, {
        tenantId,
        hasEntry: !!(payload && payload.entry),
        entryCount: payload?.entry?.length || 0,
        timestamp: new Date().toISOString(),
      });

      // Verify webhook signature (if provided)
      // Meta sends X-Hub-Signature-256 header

      // Process webhook entries
      if (payload.entry && Array.isArray(payload.entry)) {
        let messageCount = 0;
        let statusCount = 0;

        for (const entry of payload.entry) {
          (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] Processing entry`, {
            entryId: entry.id,
            hasChanges: !!(entry.changes && Array.isArray(entry.changes)),
            changeCount: entry.changes?.length || 0,
          });

          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] Processing change`, {
                field: change.field,
                hasMessages: !!(change.value && change.value.messages),
                hasStatuses: !!(change.value && change.value.statuses),
                messageCount: change.value?.messages?.length || 0,
                statusCount: change.value?.statuses?.length || 0,
              });

              if (change.value && change.value.messages) {
                // Process incoming messages
                const messages = Array.isArray(change.value.messages) ? change.value.messages : [change.value.messages];
                (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] 📨📨📨 INCOMING MESSAGES DETECTED 📨📨📨`, {
                  messageCount: messages.length,
                  phoneNumberId: change.value.metadata?.phone_number_id || null,
                  timestamp: new Date().toISOString(),
                });
                
                for (let i = 0; i < messages.length; i++) {
                  const message = messages[i];
                  (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] Processing incoming message ${i + 1}/${messages.length}`, {
                    from: message.from ? message.from.substring(0, 5) + '***' : 'MISSING',
                    messageId: message.id || 'MISSING',
                    hasText: !!message.text,
                    hasMedia: !!(message.image || message.video || message.document || message.audio || message.sticker),
                    timestamp: new Date().toISOString(),
                  });
                  
                  try {
                    await this.processIncomingMessage(tenantId, message, change.value);
                    messageCount++;
                    
                    (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] ✅ Completed processing message ${i + 1}/${messages.length}`, {
                      timestamp: new Date().toISOString(),
                    });
                  } catch (messageError: any) {
                    // Log error but continue processing other messages
                    console.error(`[WhatsApp API Service] [${webhookId}] ❌ Error processing message ${i + 1}/${messages.length}`, {
                      error: messageError.message,
                      errorCode: messageError.code,
                      messageId: message.id || 'MISSING',
                      from: message.from ? message.from.substring(0, 5) + '***' : 'MISSING',
                      errorStack: messageError.stack?.substring(0, 500),
                      timestamp: new Date().toISOString(),
                      note: 'Continuing to process remaining messages...',
                    });
                    // Don't increment messageCount for failed messages
                    // Continue processing other messages
                  }
                }
                
                (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] ✅✅✅ ALL ${messages.length} INCOMING MESSAGE(S) PROCESSED ✅✅✅`, {
                  timestamp: new Date().toISOString(),
                });
              }

              if (change.value && change.value.statuses) {
                // Process message status updates
                const statuses = Array.isArray(change.value.statuses) ? change.value.statuses : [change.value.statuses];
                (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] Processing ${statuses.length} status update(s)`);
                
                for (const status of statuses) {
                  await this.processMessageStatus(tenantId, status);
                  statusCount++;
                }
              }
            }
          }
        }

        const duration = Date.now() - startTime;
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${webhookId}] Webhook processing completed`, {
          tenantId,
          messageCount,
          statusCount,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.warn(`[WhatsApp API Service] [${webhookId}] No entries found in webhook payload`, {
          tenantId,
          payloadKeys: payload ? Object.keys(payload) : [],
        });
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp API Service] [${webhookId}] Error processing webhook`, {
        tenantId,
        error: error.message,
        errorStack: error.stack?.substring(0, 500),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Process incoming message
   */
  private async processIncomingMessage(
    tenantId: string,
    message: any,
    metadata: any
  ): Promise<void> {
    const messageId = `incoming_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] ===== PROCESSING INCOMING MESSAGE =====`, {
        tenantId,
        fullMessage: JSON.stringify(message),
        fullMetadata: JSON.stringify(metadata),
        timestamp: new Date().toISOString(),
      });

      const rawFrom = message.from;
      const phoneNumber = this.normalizePhoneForWhatsApp(rawFrom);
      const metaMessageId = message.id;
      const messageText = message.text?.body || message.caption || '';
      const timestamp = new Date(parseInt(message.timestamp) * 1000);

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] Message details extracted`, {
        rawFrom: rawFrom ? rawFrom.substring(0, 5) + '***' : 'MISSING',
        normalizedPhone: phoneNumber ? phoneNumber.substring(0, 5) + '***' : 'MISSING',
        metaMessageId,
        messageTextLength: messageText.length,
        messageTextPreview: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''),
        timestamp: timestamp.toISOString(),
        hasText: !!message.text,
        hasImage: !!message.image,
        hasVideo: !!message.video,
        hasDocument: !!message.document,
        hasAudio: !!message.audio,
        hasSticker: !!message.sticker,
      });

      // Find contact by phone number (exact or normalized match)
      let contactId: string | null = null;
      let contactName: string | null = null;
      const exactMatch = await this.db.query<{ id: string; name: string }>(
        'SELECT id, name FROM contacts WHERE tenant_id = $1 AND contact_no = $2',
        [tenantId, phoneNumber]
      );
      if (exactMatch.length > 0) {
        contactId = exactMatch[0].id;
        contactName = exactMatch[0].name;
      } else if (rawFrom && rawFrom !== phoneNumber) {
        const rawMatch = await this.db.query<{ id: string; name: string }>(
          'SELECT id, name FROM contacts WHERE tenant_id = $1 AND contact_no = $2',
          [tenantId, rawFrom]
        );
        if (rawMatch.length > 0) {
          contactId = rawMatch[0].id;
          contactName = rawMatch[0].name;
        }
      }
      if (!contactId && !contactName) {
        const allContacts = await this.db.query<{ id: string; name: string; contact_no: string | null }>(
          'SELECT id, name, contact_no FROM contacts WHERE tenant_id = $1',
          [tenantId]
        );
        for (const c of allContacts) {
          if (!c.contact_no) continue;
          try {
            if (this.normalizePhoneForWhatsApp(c.contact_no) === phoneNumber) {
              contactId = c.id;
              contactName = c.name;
              break;
            }
          } catch {
            /* skip invalid */
          }
        }
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] Contact lookup completed`, {
        normalizedPhone: phoneNumber.substring(0, 5) + '***',
        contactFound: !!contactId,
        contactId: contactId || null,
        contactName: contactName || null,
      });

      // Save message to database
      const dbMessageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      // Handle media if present
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      
      if (message.image) {
        mediaUrl = message.image.id;
        mediaType = 'image';
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] 📷 Image message detected`, {
          imageId: mediaUrl,
          caption: message.image.caption || null,
        });
      } else if (message.video) {
        mediaUrl = message.video.id;
        mediaType = 'video';
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] 🎥 Video message detected`, {
          videoId: mediaUrl,
          caption: message.video.caption || null,
        });
      } else if (message.document) {
        mediaUrl = message.document.id;
        mediaType = 'document';
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] 📄 Document message detected`, {
          documentId: mediaUrl,
          filename: message.document.filename || null,
          caption: message.document.caption || null,
        });
      } else if (message.audio) {
        mediaUrl = message.audio.id;
        mediaType = 'audio';
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] 🎵 Audio message detected`, {
          audioId: mediaUrl,
        });
      } else if (message.sticker) {
        mediaUrl = message.sticker.id;
        mediaType = 'sticker';
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] 😀 Sticker message detected`, {
          stickerId: mediaUrl,
        });
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] Checking for duplicate message`, {
        metaMessageId,
        phoneNumber: phoneNumber.substring(0, 5) + '***',
        timestamp: new Date().toISOString(),
      });

      // Check if message already exists (duplicate check)
      const existingMessage = await this.db.query<{ id: string }>(
        `SELECT id FROM whatsapp_messages 
         WHERE tenant_id = $1 AND message_id = $2`,
        [tenantId, metaMessageId]
      );

      if (existingMessage.length > 0) {
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] ⚠️ Duplicate message detected, skipping insert`, {
          metaMessageId,
          existingDbId: existingMessage[0].id,
          phoneNumber: phoneNumber.substring(0, 5) + '***',
          timestamp: new Date().toISOString(),
          note: 'Message already exists in database, likely duplicate webhook from Meta',
        });
        // Message already exists, return early (don't throw error)
        return;
      }

      // Check if auto-reply menu is enabled -- if so, mark message as read immediately
      let isAutoReplyEnabled = false;
      try {
        const menuConfigRows = await this.db.query<{ value: any }>(
          `SELECT value FROM app_settings WHERE tenant_id = $1 AND key = 'whatsapp_auto_menu'`,
          [tenantId]
        );
        if (menuConfigRows.length > 0) {
          const menuCfg = typeof menuConfigRows[0].value === 'string'
            ? JSON.parse(menuConfigRows[0].value)
            : menuConfigRows[0].value;
          isAutoReplyEnabled = !!(menuCfg && menuCfg.enabled);
        }
      } catch (menuCheckErr) {
        // Non-critical -- proceed without auto-reply flag
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] Saving message to database`, {
        dbMessageId,
        phoneNumber: phoneNumber.substring(0, 5) + '***',
        hasMedia: !!mediaUrl,
        mediaType: mediaType || null,
        isAutoReplyEnabled,
      });

      try {
        await this.db.query(
          `INSERT INTO whatsapp_messages (
            id, tenant_id, contact_id, phone_number, message_id, wam_id,
            direction, status, message_text, media_url, media_type,
            media_caption, timestamp${isAutoReplyEnabled ? ', read_at' : ''}
          ) VALUES ($1, $2, $3, $4, $5, $6, 'incoming', 'received', $7, $8, $9, $10, $11${isAutoReplyEnabled ? ', NOW()' : ''})`,
          [
            dbMessageId,
            tenantId,
            contactId,
            phoneNumber,
            metaMessageId,
            metaMessageId,
            messageText,
            mediaUrl,
            mediaType,
            messageText, // Use message text as caption if media
            timestamp,
          ]
        );
      } catch (dbError: any) {
        // Handle unique constraint violation (duplicate message_id)
        if (dbError.code === '23505' || dbError.message?.includes('UNIQUE constraint') || dbError.message?.includes('duplicate key')) {
          (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] ⚠️ Duplicate message detected (database constraint), skipping`, {
            metaMessageId,
            phoneNumber: phoneNumber.substring(0, 5) + '***',
            errorCode: dbError.code,
            timestamp: new Date().toISOString(),
            note: 'Message already exists in database, likely duplicate webhook from Meta',
          });
          // Message already exists, return early (don't throw error)
          return;
        }
        // Re-throw other database errors
        throw dbError;
      }

      const duration = Date.now() - startTime;
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] ✅✅✅ INCOMING MESSAGE SAVED TO DATABASE ✅✅✅`, {
        dbMessageId,
        phoneNumber: phoneNumber.substring(0, 5) + '***',
        contactName: contactName || 'Unknown',
        messageTextPreview: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
        hasMedia: !!mediaUrl,
        mediaType: mediaType || null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      // Emit WebSocket event for WhatsApp message received
      emitToTenant(tenantId, WS_EVENTS.WHATSAPP_MESSAGE_RECEIVED, {
        id: dbMessageId,
        tenantId,
        contactId,
        phoneNumber,
        messageId: metaMessageId,
        wamId: metaMessageId,
        direction: 'incoming',
        status: 'received',
        messageText,
        mediaUrl,
        mediaType,
        timestamp,
        autoReplied: isAutoReplyEnabled,
      });

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${messageId}] WebSocket event emitted`, {
        dbMessageId,
        event: WS_EVENTS.WHATSAPP_MESSAGE_RECEIVED,
        timestamp: new Date().toISOString(),
      });

      // Handle auto-reply menu -- await to ensure session is created before returning
      try {
        await this.handleAutoReplyMenu(tenantId, phoneNumber, messageText, contactId);
      } catch (autoReplyErr: any) {
        console.error(`[WhatsApp API Service] [${messageId}] Auto-reply menu error (non-blocking):`, autoReplyErr.message);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp API Service] [${messageId}] ❌❌❌ ERROR PROCESSING INCOMING MESSAGE ❌❌❌`, {
        error: error.message,
        errorStack: error.stack?.substring(0, 1000),
        tenantId,
        messageData: JSON.stringify(message).substring(0, 500),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Process message status update
   */
  private async processMessageStatus(tenantId: string, status: any): Promise<void> {
    const statusId = `status_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    try {
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] ===== PROCESSING MESSAGE STATUS UPDATE =====`, {
        tenantId,
        fullStatusData: JSON.stringify(status),
        timestamp: new Date().toISOString(),
      });

      const messageId = status.id; // This is the WAM ID from Meta
      const statusValue = status.status; // sent, delivered, read, failed
      const recipientId = status.recipient_id;
      const timestamp = status.timestamp;
      const error = status.errors?.[0]; // Error details if status is failed

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] Status details extracted`, {
        wamId: messageId,
        statusValue,
        recipientId: recipientId ? recipientId.substring(0, 5) + '***' : null,
        timestamp,
        hasError: !!error,
        errorDetails: error ? {
          code: error.code,
          title: error.title,
          message: error.message,
          errorData: error.error_data,
        } : null,
      });

      // Map Meta status to our status
      let mappedStatus: 'sent' | 'delivered' | 'read' | 'failed' = 'sent';
      if (statusValue === 'delivered') {
        mappedStatus = 'delivered';
      } else if (statusValue === 'read') {
        mappedStatus = 'read';
      } else if (statusValue === 'failed') {
        mappedStatus = 'failed';
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] Status mapped`, {
        originalStatus: statusValue,
        mappedStatus,
      });

      // Check if message exists in database
      const existingMessages = await this.db.query(
        `SELECT id, status, phone_number FROM whatsapp_messages
         WHERE tenant_id = $1 AND message_id = $2`,
        [tenantId, messageId]
      );

      if (existingMessages.length === 0) {
        console.warn(`[WhatsApp API Service] [${statusId}] Message not found in database for status update`, {
          tenantId,
          messageId,
          statusValue,
        });
        return;
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] Message found in database`, {
        dbMessageId: existingMessages[0].id,
        currentStatus: existingMessages[0].status,
        phoneNumber: existingMessages[0].phone_number ? existingMessages[0].phone_number.substring(0, 5) + '***' : null,
      });

      // Update message status in database
      const updateResult = await this.db.query(
        `UPDATE whatsapp_messages
         SET status = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND message_id = $3
         RETURNING id, phone_number`,
        [mappedStatus, tenantId, messageId]
      );

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] ✅✅✅ MESSAGE STATUS UPDATED IN DATABASE ✅✅✅`, {
        dbMessageId: updateResult[0]?.id,
        wamId: messageId,
        oldStatus: existingMessages[0].status,
        newStatus: mappedStatus,
        rowsUpdated: updateResult.length,
        phoneNumber: existingMessages[0].phone_number?.substring(0, 5) + '***',
        timestamp: new Date().toISOString(),
      });

      // Log delivery status interpretation
      if (mappedStatus === 'delivered') {
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] 📱 MESSAGE DELIVERED TO RECIPIENT`, {
          wamId: messageId,
          note: 'Message was successfully delivered to recipient\'s device',
          timestamp: new Date().toISOString(),
        });
      } else if (mappedStatus === 'read') {
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] 👁️ MESSAGE READ BY RECIPIENT`, {
          wamId: messageId,
          note: 'Recipient has opened and read the message',
          timestamp: new Date().toISOString(),
        });
      } else if (mappedStatus === 'failed') {
        console.error(`[WhatsApp API Service] [${statusId}] ❌ MESSAGE DELIVERY FAILED`, {
          wamId: messageId,
          error: error || 'Unknown error',
          note: 'Message failed to deliver. Check error details above.',
          timestamp: new Date().toISOString(),
        });
      }

      // Emit WebSocket event for status update
      emitToTenant(tenantId, WS_EVENTS.WHATSAPP_MESSAGE_STATUS, {
        messageId,
        wamId: messageId,
        status: mappedStatus,
        timestamp: new Date(),
      });

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${statusId}] Status update processed successfully`, {
        wamId: messageId,
        status: mappedStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(`[WhatsApp API Service] [${statusId}] Error processing message status`, {
        error: error.message,
        errorStack: error.stack?.substring(0, 500),
        tenantId,
        statusData: JSON.stringify(status).substring(0, 500),
        timestamp: new Date().toISOString(),
      });
      // Don't throw - status updates are non-critical
    }
  }

  /**
   * Get message history for a contact/phone number
   */
  async getMessages(
    tenantId: string,
    options: {
      contactId?: string;
      phoneNumber?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<WhatsAppMessage[]> {
    try {
      // Always filter by tenant_id first (required for multi-tenant isolation)
      let query = 'SELECT * FROM whatsapp_messages WHERE tenant_id = $1';
      const params: any[] = [tenantId];
      let paramIndex = 2;

      // If contactId is provided, filter by it (most specific)
      if (options.contactId) {
        query += ` AND contact_id = $${paramIndex}`;
        params.push(options.contactId);
        paramIndex++;
        
        // Also filter by phone number if provided to ensure we only get messages
        // for this specific contact's phone number (in case contact has multiple numbers)
        if (options.phoneNumber) {
          const canonical = this.normalizePhoneForWhatsApp(options.phoneNumber);
          const digitsOnly = this.digitsOnlyPhone(options.phoneNumber);
          if (digitsOnly && digitsOnly !== canonical) {
            query += ` AND (phone_number = $${paramIndex} OR phone_number = $${paramIndex + 1})`;
            params.push(canonical, digitsOnly);
            paramIndex += 2;
          } else {
            query += ` AND phone_number = $${paramIndex}`;
            params.push(canonical);
            paramIndex++;
          }
        }
      } else if (options.phoneNumber) {
        // If no contactId but phoneNumber is provided, filter by phone number only
        // This ensures messages are isolated by tenant_id + phone_number
        const canonical = this.normalizePhoneForWhatsApp(options.phoneNumber);
        const digitsOnly = this.digitsOnlyPhone(options.phoneNumber);
        if (digitsOnly && digitsOnly !== canonical) {
          query += ` AND (phone_number = $${paramIndex} OR phone_number = $${paramIndex + 1})`;
          params.push(canonical, digitsOnly);
          paramIndex += 2;
        } else {
          query += ` AND phone_number = $${paramIndex}`;
          params.push(canonical);
          paramIndex++;
        }
      }

      query += ' ORDER BY timestamp DESC';

      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
        paramIndex++;
      }

      const messages = await this.db.query<WhatsAppMessage>(query, params);
      return messages.reverse(); // Return in chronological order (oldest first)
    } catch (error) {
      console.error('Error getting messages:', error);
      throw error;
    }
  }

  /**
   * Get unread message count for a tenant
   */
  async getUnreadCount(tenantId: string): Promise<number> {
    try {
      const result = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM whatsapp_messages
         WHERE tenant_id = $1 AND direction = 'incoming' AND read_at IS NULL`,
        [tenantId]
      );

      return parseInt(result[0]?.count || '0', 10);
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Get unread conversations grouped by phone number
   * Returns latest unread message per phone number with count
   */
  async getUnreadConversations(tenantId: string): Promise<{
    phoneNumber: string;
    contactId: string | null;
    contactName: string | null;
    unreadCount: number;
    lastMessage: string;
    lastTimestamp: string;
  }[]> {
    try {
      const result = await this.db.query<{
        phone_number: string;
        contact_id: string | null;
        contact_name: string | null;
        unread_count: string;
        last_message: string;
        last_timestamp: string;
      }>(
        `SELECT
           m.phone_number,
           m.contact_id,
           c.name as contact_name,
           COUNT(*) as unread_count,
           (SELECT message_text FROM whatsapp_messages m2
            WHERE m2.phone_number = m.phone_number AND m2.tenant_id = $1
              AND m2.direction = 'incoming' AND m2.read_at IS NULL
            ORDER BY m2.timestamp DESC LIMIT 1) as last_message,
           MAX(m.timestamp) as last_timestamp
         FROM whatsapp_messages m
         LEFT JOIN contacts c ON c.id = m.contact_id AND c.tenant_id = $1
         WHERE m.tenant_id = $1 AND m.direction = 'incoming' AND m.read_at IS NULL
         GROUP BY m.phone_number, m.contact_id, c.name
         ORDER BY MAX(m.timestamp) DESC
         LIMIT 50`,
        [tenantId]
      );

      return result.map(row => ({
        phoneNumber: row.phone_number,
        contactId: row.contact_id || null,
        contactName: row.contact_name || null,
        unreadCount: parseInt(row.unread_count || '0', 10),
        lastMessage: row.last_message || 'New message',
        lastTimestamp: row.last_timestamp,
      }));
    } catch (error) {
      console.error('Error getting unread conversations:', error);
      return [];
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(tenantId: string, messageId: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE whatsapp_messages
         SET read_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, messageId]
      );
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw error;
    }
  }

  /**
   * Mark all messages from a phone number as read
   * @param tenantId - Tenant ID (required for multi-tenant isolation)
   * @param phoneNumber - Phone number to mark messages as read for
   * @param contactId - Optional contact ID to only mark messages for this specific contact
   */
  async markAllAsRead(tenantId: string, phoneNumber: string, contactId?: string): Promise<void> {
    try {
      const canonical = this.normalizePhoneForWhatsApp(phoneNumber);
      const digitsOnly = this.digitsOnlyPhone(phoneNumber);
      
      // Build query with tenant_id filter (always required)
      let query = `UPDATE whatsapp_messages
           SET read_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1 AND direction = 'incoming' AND read_at IS NULL`;
      const params: any[] = [tenantId];
      let paramIndex = 2;
      
      // If contactId is provided, filter by it to ensure we only mark messages for this contact
      if (contactId) {
        query += ` AND contact_id = $${paramIndex}`;
        params.push(contactId);
        paramIndex++;
      }
      
      // Filter by phone number (normalized)
      if (digitsOnly && digitsOnly !== canonical) {
        query += ` AND (phone_number = $${paramIndex} OR phone_number = $${paramIndex + 1})`;
        params.push(canonical, digitsOnly);
      } else {
        query += ` AND phone_number = $${paramIndex}`;
        params.push(canonical);
      }
      
      await this.db.query(query, params);
    } catch (error) {
      console.error('Error marking all messages as read:', error);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(
    tenantId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const testId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${testId}] testConnection called`, {
        tenantId,
        timestamp: new Date().toISOString(),
      });

      const config = await this.getConfig(tenantId);
      if (!config) {
        console.error(`[WhatsApp API Service] [${testId}] No configuration found`, {
          tenantId,
          timestamp: new Date().toISOString(),
        });
        return { ok: false, error: 'WhatsApp API not configured for this tenant' };
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${testId}] Configuration loaded`, {
        tenantId,
        phoneNumberId: config.phoneNumberId,
        businessAccountId: config.businessAccountId || null,
        hasApiKey: !!config.apiKey,
        apiKeyLength: config.apiKey?.length || 0,
        apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'missing',
        apiBaseUrl: `${this.apiBaseUrl}/${this.apiVersion}`,
        timestamp: new Date().toISOString(),
      });

      const apiClient = this.createApiClient(config);
      const testUrl = `/${config.phoneNumberId}`;
      const fullUrl = `${this.apiBaseUrl}/${this.apiVersion}${testUrl}`;

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${testId}] Making test API call to Meta`, {
        url: fullUrl,
        phoneNumberId: config.phoneNumberId,
        method: 'GET',
        timestamp: new Date().toISOString(),
      });

      // Try to get phone number info (lightweight API call)
      const response = await apiClient.get(testUrl);

      const duration = Date.now() - startTime;
      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${testId}] Meta API response received`, {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        responseKeys: response.data ? Object.keys(response.data) : [],
        responseData: JSON.stringify(response.data).substring(0, 500),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp API Service] [${testId}] Connection test successful`, {
        tenantId,
        phoneNumberId: config.phoneNumberId,
        totalDuration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return { ok: true };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const apiErrorMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.error?.type ||
        error?.response?.data?.error?.code ||
        error?.message;

      console.error(`[WhatsApp API Service] [${testId}] Connection test failed`, {
        tenantId,
        error: error.message,
        errorCode: error.code,
        errorStack: error.stack?.substring(0, 500),
        apiErrorMessage,
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
        } : null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return { ok: false, error: apiErrorMessage || 'Connection failed' };
    }
  }

  // ================================================================
  // WhatsApp Auto-Reply Menu
  // ================================================================

  /**
   * Format a numbered menu into a text message string.
   * E.g.:
   *   Welcome! Please select an option:
   *
   *   1. Our Services
   *   2. Support
   */
  private formatMenuText(headerMessage: string, items: Array<{ number: string; label: string }>): string {
    let text = headerMessage + '\n';
    for (const item of items) {
      text += `\n${item.number}. ${item.label}`;
    }
    return text;
  }

  /**
   * Handle auto-reply menu logic after receiving an incoming message.
   * - Loads menu config from app_settings
   * - Checks / creates / updates conversation session
   * - Sends the appropriate reply via sendTextMessage()
   */
  private async handleAutoReplyMenu(
    tenantId: string,
    phoneNumber: string,
    messageText: string,
    contactId: string | null
  ): Promise<void> {
    const logId = `auto_menu_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      // 1. Load menu config from app_settings
      const configRows = await this.db.query<{ value: any }>(
        `SELECT value FROM app_settings WHERE tenant_id = $1 AND key = 'whatsapp_auto_menu'`,
        [tenantId]
      );

      if (configRows.length === 0) {
        return; // No menu configured
      }

      const menuConfig = typeof configRows[0].value === 'string'
        ? JSON.parse(configRows[0].value)
        : configRows[0].value;

      if (!menuConfig || !menuConfig.enabled) {
        return; // Menu disabled
      }

      const timeoutMinutes = menuConfig.sessionTimeoutMinutes || 30;
      const userInput = messageText.trim();
      const menuItems: Array<{ id: string; number: string; label: string; type: string; replyText: string | null; subMenu: any }> = menuConfig.menuItems || [];

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Processing incoming message`, {
        tenantId,
        phoneNumber: phoneNumber.substring(0, 5) + '***',
        userInput,
        menuItemCount: menuItems.length,
        timeoutMinutes,
      });

      // 2. Load existing ACTIVE session (expiry check done in SQL to avoid timezone issues)
      const sessionRows = await this.db.query<{
        id: string;
        current_menu_path: string;
      }>(
        `SELECT id, current_menu_path FROM whatsapp_menu_sessions
         WHERE tenant_id = $1 AND phone_number = $2
         AND last_interaction_at >= NOW() - CAST($3 || ' minutes' AS INTERVAL)`,
        [tenantId, phoneNumber, String(timeoutMinutes)]
      );

      const session = sessionRows.length > 0 ? sessionRows[0] : null;

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Session lookup`, {
        found: !!session,
        currentMenuPath: session?.current_menu_path || null,
        phoneNumber: phoneNumber.substring(0, 5) + '***',
      });

      // 3. Determine what to send
      let replyText: string | null = null;
      let newMenuPath: string | null = null; // null = delete session, string = upsert

      if (!session) {
        // No active session -- send main menu
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] No active session, sending main menu`);
        replyText = this.formatMenuText(menuConfig.welcomeMessage, menuItems);
        newMenuPath = 'root';
      } else if (session.current_menu_path === 'root') {
        // User is at root menu -- match input against menu item numbers
        const matched = menuItems.find((item: any) => String(item.number).trim() === userInput);

        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Root menu matching`, {
          userInput,
          availableNumbers: menuItems.map(i => i.number),
          matched: matched ? { number: matched.number, label: matched.label, type: matched.type } : null,
        });

        if (!matched) {
          replyText = menuConfig.invalidOptionMessage || 'Invalid option. Please reply with a valid number.';
          newMenuPath = 'root'; // stay at root
        } else if (matched.type === 'reply') {
          replyText = matched.replyText || 'Thank you!';
          newMenuPath = null; // conversation done, clear session
        } else if (matched.type === 'submenu' && matched.subMenu) {
          replyText = this.formatMenuText(
            matched.subMenu.message || `${matched.label}:`,
            matched.subMenu.items || []
          );
          newMenuPath = matched.id; // track which submenu we're in
        } else {
          replyText = menuConfig.invalidOptionMessage || 'Invalid option. Please reply with a valid number.';
          newMenuPath = 'root';
        }
      } else {
        // User is inside a sub-menu -- find the parent item
        const parentItem = menuItems.find((item: any) => item.id === session.current_menu_path);

        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Sub-menu matching`, {
          currentMenuPath: session.current_menu_path,
          parentFound: !!parentItem,
          userInput,
        });

        if (!parentItem || !parentItem.subMenu) {
          // Invalid state, reset to main menu
          replyText = this.formatMenuText(menuConfig.welcomeMessage, menuItems);
          newMenuPath = 'root';
        } else {
          const subItems: Array<{ id: string; number: string; label: string; type: string; replyText: string | null }> = parentItem.subMenu.items || [];
          const matched = subItems.find((si: any) => String(si.number).trim() === userInput);
          if (!matched) {
            replyText = menuConfig.invalidOptionMessage || 'Invalid option. Please reply with a valid number.';
            newMenuPath = session.current_menu_path; // stay in submenu
          } else if (matched.type === 'back') {
            // Go back to main menu
            replyText = this.formatMenuText(menuConfig.welcomeMessage, menuItems);
            newMenuPath = 'root';
          } else if (matched.type === 'reply') {
            replyText = matched.replyText || 'Thank you!';
            newMenuPath = null; // conversation done
          } else {
            replyText = menuConfig.invalidOptionMessage || 'Invalid option. Please reply with a valid number.';
            newMenuPath = session.current_menu_path;
          }
        }
      }

      (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Decision`, {
        action: newMenuPath === null ? 'END_CONVERSATION' : newMenuPath === 'root' ? 'MAIN_MENU' : 'SUB_MENU',
        newMenuPath,
        replyLength: replyText?.length || 0,
        replyPreview: replyText ? replyText.substring(0, 80) : null,
      });

      // 4. Update / create / delete session FIRST (before sending reply)
      if (newMenuPath !== null) {
        // Upsert session
        const sessionId = session?.id || `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await this.db.query(
          `INSERT INTO whatsapp_menu_sessions (id, tenant_id, phone_number, current_menu_path, last_interaction_at, created_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (tenant_id, phone_number)
           DO UPDATE SET current_menu_path = EXCLUDED.current_menu_path, last_interaction_at = NOW()`,
          [sessionId, tenantId, phoneNumber, newMenuPath]
        );
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Session upserted`, { newMenuPath });
      } else if (session) {
        // Delete session (conversation complete)
        await this.db.query(
          `DELETE FROM whatsapp_menu_sessions WHERE tenant_id = $1 AND phone_number = $2`,
          [tenantId, phoneNumber]
        );
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Session deleted (conversation complete)`);
      }

      // 5. Send the reply
      if (replyText) {
        await this.sendTextMessage(tenantId, phoneNumber, replyText, contactId || undefined);
        (DEBUG_WHATSAPP ? console.log : () => {})(`[WhatsApp Auto-Reply] [${logId}] Reply sent successfully`);
      }
    } catch (error: any) {
      console.error(`[WhatsApp Auto-Reply] [${logId}] Error in auto-reply menu`, {
        error: error.message,
        errorStack: error.stack?.substring(0, 500),
        tenantId,
        phoneNumber: phoneNumber.substring(0, 5) + '***',
        messageText: messageText.substring(0, 50),
      });
      // Don't re-throw -- auto-reply errors should not break incoming message processing
    }
  }
}

// Singleton instance
let whatsappApiServiceInstance: WhatsAppApiService | null = null;

export function getWhatsAppApiService(): WhatsAppApiService {
  if (!whatsappApiServiceInstance) {
    whatsappApiServiceInstance = new WhatsAppApiService();
  }
  return whatsappApiServiceInstance;
}
