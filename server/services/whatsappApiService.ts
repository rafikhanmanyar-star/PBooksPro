import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { getDatabaseService } from './databaseService.js';
import { encryptionService } from './encryptionService.js';
import { emitToTenant, WS_EVENTS } from './websocketHelper.js';

/**
 * WhatsApp Business API Service
 * Handles integration with Meta WhatsApp Business Cloud API
 */

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
  private readonly apiBaseUrl = 'https://graph.facebook.com';
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

      const config = configs[0];

      // Decrypt API key
      const decryptedApiKey = encryptionService.decrypt(config.api_key);
      const decryptedApiSecret = config.api_secret
        ? encryptionService.decrypt(config.api_secret)
        : undefined;

      return {
        ...config,
        apiKey: decryptedApiKey,
        apiSecret: decryptedApiSecret,
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
      apiKey: string;
      apiSecret?: string;
      phoneNumberId: string;
      businessAccountId?: string;
      verifyToken: string;
      webhookUrl?: string;
    }
  ): Promise<WhatsAppConfig> {
    try {
      // Encrypt API credentials
      const encryptedApiKey = encryptionService.encrypt(configData.apiKey);
      const encryptedApiSecret = configData.apiSecret
        ? encryptionService.encrypt(configData.apiSecret)
        : null;

      // Check if config exists
      const existing = await this.db.query(
        'SELECT id FROM whatsapp_configs WHERE tenant_id = $1',
        [tenantId]
      );

      const configId = existing.length > 0
        ? existing[0].id
        : `whatsapp_config_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

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
            encryptedApiSecret,
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
            encryptedApiSecret,
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
    const config = await this.getConfig(tenantId);
    if (!config) {
      throw new Error('WhatsApp API not configured for this tenant');
    }

    try {
      // Format phone number (remove non-numeric, add country code if needed)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const apiClient = this.createApiClient(config);

      // Send message via Meta API
      const response = await apiClient.post(`/${config.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      });

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

      // Emit WebSocket event
      emitToTenant(tenantId, WS_EVENTS.CHAT_MESSAGE, {
        id: dbMessageId,
        tenantId,
        contactId,
        phoneNumber: formattedPhone,
        messageId,
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
      console.error('Error sending WhatsApp message:', error);
      
      // Save failed message to database
      const dbMessageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      try {
        await this.db.query(
          `INSERT INTO whatsapp_messages (
            id, tenant_id, contact_id, phone_number,
            direction, status, message_text, timestamp
          ) VALUES ($1, $2, $3, $4, 'outgoing', 'failed', $5, NOW())`,
          [dbMessageId, tenantId, contactId || null, this.formatPhoneNumber(phoneNumber), message]
        );
      } catch (dbError) {
        console.error('Error saving failed message:', dbError);
      }

      throw new Error(
        error.response?.data?.error?.message || error.message || 'Failed to send WhatsApp message'
      );
    }
  }

  /**
   * Format phone number for WhatsApp API
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-numeric characters
    let cleaned = phoneNumber.replace(/[^0-9]/g, '');

    // Remove leading zero if present
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // Ensure it's at least 10 digits
    if (cleaned.length < 10) {
      throw new Error('Invalid phone number format');
    }

    return cleaned;
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
    try {
      // Verify webhook signature (if provided)
      // Meta sends X-Hub-Signature-256 header

      // Process webhook entries
      if (payload.entry && Array.isArray(payload.entry)) {
        for (const entry of payload.entry) {
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.value && change.value.messages) {
                // Process incoming messages
                for (const message of change.value.messages) {
                  await this.processIncomingMessage(tenantId, message, change.value);
                }
              }

              if (change.value && change.value.statuses) {
                // Process message status updates
                for (const status of change.value.statuses) {
                  await this.processMessageStatus(tenantId, status);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing webhook:', error);
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
    try {
      const phoneNumber = message.from;
      const messageId = message.id;
      const messageText = message.text?.body || message.caption || '';
      const timestamp = new Date(parseInt(message.timestamp) * 1000);

      // Find contact by phone number
      const contacts = await this.db.query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND contact_no = $2',
        [tenantId, phoneNumber]
      );
      const contactId = contacts.length > 0 ? contacts[0].id : null;

      // Save message to database
      const dbMessageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      // Handle media if present
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      
      if (message.image) {
        mediaUrl = message.image.id;
        mediaType = 'image';
      } else if (message.video) {
        mediaUrl = message.video.id;
        mediaType = 'video';
      } else if (message.document) {
        mediaUrl = message.document.id;
        mediaType = 'document';
      } else if (message.audio) {
        mediaUrl = message.audio.id;
        mediaType = 'audio';
      } else if (message.sticker) {
        mediaUrl = message.sticker.id;
        mediaType = 'sticker';
      }

      await this.db.query(
        `INSERT INTO whatsapp_messages (
          id, tenant_id, contact_id, phone_number, message_id, wam_id,
          direction, status, message_text, media_url, media_type,
          media_caption, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, 'incoming', 'received', $7, $8, $9, $10, $11)`,
        [
          dbMessageId,
          tenantId,
          contactId,
          phoneNumber,
          messageId,
          messageId,
          messageText,
          mediaUrl,
          mediaType,
          messageText, // Use message text as caption if media
          timestamp,
        ]
      );

      // Emit WebSocket event
      emitToTenant(tenantId, WS_EVENTS.CHAT_MESSAGE, {
        id: dbMessageId,
        tenantId,
        contactId,
        phoneNumber,
        messageId,
        direction: 'incoming',
        status: 'received',
        messageText,
        mediaUrl,
        mediaType,
        timestamp,
      });
    } catch (error) {
      console.error('Error processing incoming message:', error);
      throw error;
    }
  }

  /**
   * Process message status update
   */
  private async processMessageStatus(tenantId: string, status: any): Promise<void> {
    try {
      const messageId = status.id;
      const statusValue = status.status; // sent, delivered, read, failed

      // Map Meta status to our status
      let mappedStatus: 'sent' | 'delivered' | 'read' | 'failed' = 'sent';
      if (statusValue === 'delivered') {
        mappedStatus = 'delivered';
      } else if (statusValue === 'read') {
        mappedStatus = 'read';
      } else if (statusValue === 'failed') {
        mappedStatus = 'failed';
      }

      // Update message status in database
      await this.db.query(
        `UPDATE whatsapp_messages
         SET status = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND message_id = $3`,
        [mappedStatus, tenantId, messageId]
      );

      // Emit WebSocket event for status update
      emitToTenant(tenantId, 'whatsapp:message:status', {
        messageId,
        status: mappedStatus,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Error processing message status:', error);
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
      let query = 'SELECT * FROM whatsapp_messages WHERE tenant_id = $1';
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (options.contactId) {
        query += ` AND contact_id = $${paramIndex}`;
        params.push(options.contactId);
        paramIndex++;
      } else if (options.phoneNumber) {
        query += ` AND phone_number = $${paramIndex}`;
        params.push(options.phoneNumber);
        paramIndex++;
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
   */
  async markAllAsRead(tenantId: string, phoneNumber: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE whatsapp_messages
         SET read_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND phone_number = $2 AND direction = 'incoming' AND read_at IS NULL`,
        [tenantId, phoneNumber]
      );
    } catch (error) {
      console.error('Error marking all messages as read:', error);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(tenantId: string): Promise<boolean> {
    try {
      const config = await this.getConfig(tenantId);
      if (!config) {
        return false;
      }

      const apiClient = this.createApiClient(config);
      
      // Try to get phone number info (lightweight API call)
      await apiClient.get(`/${config.phoneNumberId}`);
      
      return true;
    } catch (error) {
      console.error('WhatsApp API connection test failed:', error);
      return false;
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
