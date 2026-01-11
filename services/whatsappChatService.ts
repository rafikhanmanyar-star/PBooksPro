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
 * WhatsApp Chat Service
 * Handles all WhatsApp API communication from the frontend
 */
export class WhatsAppChatService {
  /**
   * Get messages for a phone number
   */
  static async getMessages(phoneNumber: string, limit?: number, offset?: number): Promise<WhatsAppMessage[]> {
    try {
      const params = new URLSearchParams();
      params.append('phoneNumber', phoneNumber);
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
    try {
      const response = await apiClient.post<{ messageId?: string }>('/whatsapp/send', {
        phoneNumber: request.phoneNumber,
        message: request.message,
        contactId: request.contactId,
      });
      return {
        messageId: response.messageId || '',
        wamId: response.messageId || '',
        status: 'sent',
      };
    } catch (error: any) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Get unread message count
   */
  static async getUnreadCount(): Promise<number> {
    try {
      const response = await apiClient.get<UnreadCountResponse>('/whatsapp/unread-count');
      return response.count;
    } catch (error: any) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Mark all messages from a phone number as read
   */
  static async markAllAsRead(phoneNumber: string): Promise<void> {
    try {
      await apiClient.post('/whatsapp/messages/read-all', { phoneNumber });
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
      await apiClient.get('/whatsapp/config');
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }
}
