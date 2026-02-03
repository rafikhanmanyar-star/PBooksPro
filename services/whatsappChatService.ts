/**
 * WhatsApp Chat Service
 * Frontend service for WhatsApp API communication
 */

import { apiClient } from './api/client';
import { Contact } from '../types';

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
  timestamp: string | Date;
  createdAt: string | Date;
  readAt?: string | Date;
}

export interface SendMessageRequest {
  contactId?: string;
  phoneNumber: string;
  message: string;
}

export interface SendMessageResponse {
  messageId: string;
  wamId: string;
  status: 'sent';
}

export interface MessageListResponse {
  messages: WhatsAppMessage[];
  total?: number;
}

export interface UnreadCountResponse {
  count: number;
}

/**
 * Normalize phone for matching (must mirror server logic).
 * Used so WebSocket incoming/outgoing match contact.contactNo regardless of format.
 */
export function normalizePhoneForMatch(phone: string, defaultCountryCode = '91'): string {
  const cleaned = (phone || '').replace(/\D/g, '');
  const noLeadingZero = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  if (noLeadingZero.length < 10) return '';
  if (noLeadingZero.length === 10 && defaultCountryCode && !noLeadingZero.startsWith(defaultCountryCode)) {
    return defaultCountryCode + noLeadingZero;
  }
  return noLeadingZero;
}

/**
 * WhatsApp Chat Service
 * Handles all WhatsApp API communication from the frontend
 */
export class WhatsAppChatService {
  /**
   * Get messages for a phone number
   * @param phoneNumber - Phone number to get messages for
   * @param limit - Maximum number of messages to return
   * @param offset - Number of messages to skip
   * @param contactId - Optional contact ID to filter messages (ensures messages are only shown for this specific contact)
   */
  static async getMessages(phoneNumber: string, limit?: number, offset?: number, contactId?: string): Promise<WhatsAppMessage[]> {
    try {
      const params = new URLSearchParams();
      params.append('phoneNumber', phoneNumber);
      if (contactId) params.append('contactId', contactId);
      if (limit) params.append('limit', limit.toString());
      if (offset) params.append('offset', offset.toString());

      const queryString = params.toString();
      const url = `/whatsapp/messages?${queryString}`;

      const messages = await apiClient.get<WhatsAppMessage[]>(url);
      return messages;
    } catch (error: any) {
      console.error('Error getting messages:', error);
      throw error;
    }
  }

  /**
   * Send a message
   */
  static async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const sendId = `send_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      console.log(`[WhatsApp Chat Service] [${sendId}] ===== INITIATING MESSAGE SEND =====`, {
        phoneNumber: request.phoneNumber.substring(0, 5) + '***',
        phoneNumberLength: request.phoneNumber.length,
        messageLength: request.message.length,
        messagePreview: request.message.substring(0, 50) + (request.message.length > 50 ? '...' : ''),
        contactId: request.contactId || null,
        apiEndpoint: '/whatsapp/send',
        timestamp: new Date().toISOString(),
      });

      console.log(`[WhatsApp Chat Service] [${sendId}] Making API call to server...`, {
        timestamp: new Date().toISOString(),
      });

      const response = await apiClient.post<{ messageId?: string; wamId?: string; status?: string; success?: boolean; error?: string }>('/whatsapp/send', {
        phoneNumber: request.phoneNumber,
        message: request.message,
        contactId: request.contactId,
      });

      const duration = Date.now() - startTime;
      
      // Validate response
      if (!response || (response.error && !response.messageId)) {
        console.error(`[WhatsApp Chat Service] [${sendId}] ❌ INVALID RESPONSE FROM SERVER`, {
          response: JSON.stringify(response),
          hasMessageId: !!response?.messageId,
          hasError: !!response?.error,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });
        throw new Error(response?.error || 'Invalid response from server');
      }

      console.log(`[WhatsApp Chat Service] [${sendId}] ✅✅✅ SERVER RESPONSE RECEIVED ✅✅✅`, {
        messageId: response.messageId || null,
        wamId: response.wamId || null,
        status: response.status || null,
        success: response.success || null,
        fullResponse: JSON.stringify(response),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      if (!response.messageId && !response.wamId) {
        console.error(`[WhatsApp Chat Service] [${sendId}] ❌ NO MESSAGE ID IN RESPONSE`, {
          response: JSON.stringify(response),
          timestamp: new Date().toISOString(),
        });
        throw new Error('Server did not return a message ID. Message may not have been sent to Meta.');
      }

      return {
        messageId: response.messageId || response.wamId || '',
        wamId: response.wamId || response.messageId || '',
        status: (response.status as 'sent') || 'sent',
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp Chat Service] [${sendId}] ❌❌❌ ERROR SENDING MESSAGE ❌❌❌`, {
        errorType: error.constructor?.name || typeof error,
        errorMessage: error.message,
        errorStatus: error.status || error.response?.status,
        errorResponse: error.response?.data || null,
        errorStack: error.stack?.substring(0, 500),
        phoneNumber: request.phoneNumber.substring(0, 5) + '***',
        messageLength: request.message.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Get unread message count
   */
  static async getUnreadCount(): Promise<number> {
    try {
      // Check if authenticated before making API call to prevent 401 errors
      if (!apiClient.getToken()) {
        return 0;
      }
      const response = await apiClient.get<UnreadCountResponse>('/whatsapp/unread-count');
      return response.count;
    } catch (error: any) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Mark all messages from a phone number as read
   * @param phoneNumber - Phone number to mark messages as read for
   * @param contactId - Optional contact ID to only mark messages for this specific contact
   */
  static async markAllAsRead(phoneNumber: string, contactId?: string): Promise<void> {
    try {
      await apiClient.post('/whatsapp/messages/read-all', { phoneNumber, contactId });
    } catch (error: any) {
      console.error('Error marking all messages as read:', error);
      throw error;
    }
  }


  /**
   * Check if WhatsApp API is configured
   */
  static async isConfigured(): Promise<boolean> {
    try {
      const response = await apiClient.get<{ configured?: boolean }>('/whatsapp/config');
      // Check the configured flag in the response
      return response.configured !== false;
    } catch (error: any) {
      // If there's an error, assume not configured
      console.error('Error checking WhatsApp config:', error);
      return false;
    }
  }
}
