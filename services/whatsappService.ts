import { Contact, WhatsAppTemplates } from '../types';
import { CURRENCY } from '../constants';

/**
 * WhatsApp Service Module
 * 
 * This module provides a centralized service for WhatsApp integration.
 * Currently implements wa.me URL scheme, with architecture ready for WhatsApp Business API.
 * 
 * @module whatsappService
 */

export interface WhatsAppMessageOptions {
  contact: Contact;
  message: string;
  phoneNumber?: string;
}

export interface TemplateVariables {
  [key: string]: string | number;
}

export interface WhatsAppConfig {
  useBusinessAPI: boolean;
  apiEndpoint?: string;
  apiToken?: string;
  phoneNumberId?: string;
}

/**
 * WhatsApp Service Class
 * Handles all WhatsApp-related operations including message generation and sending
 */
export class WhatsAppService {
  private static config: WhatsAppConfig = {
    useBusinessAPI: false,
  };

  /**
   * Initialize WhatsApp service configuration
   * For future WhatsApp Business API integration
   */
  static initialize(config?: Partial<WhatsAppConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Validates and formats phone number for WhatsApp
   * Removes non-numeric characters and handles common formatting
   */
  static formatPhoneNumber(phoneNumber: string): string | null {
    if (!phoneNumber) return null;
    
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/[^0-9]/g, '');
    
    // Basic validation - should be at least 10 digits
    if (cleaned.length < 10) return null;
    
    // If it starts with 0, remove it (common in some countries)
    const withoutLeadingZero = cleaned.startsWith('0') ? cleaned.substring(1) : cleaned;
    
    return withoutLeadingZero;
  }

  /**
   * Validates if a phone number is valid for WhatsApp
   */
  static isValidPhoneNumber(phoneNumber: string): boolean {
    const formatted = this.formatPhoneNumber(phoneNumber);
    return formatted !== null && formatted.length >= 10;
  }

  /**
   * Replaces template variables in a message
   * Supports placeholders like {contactName}, {amount}, etc.
   */
  static replaceTemplateVariables(
    template: string, 
    variables: TemplateVariables
  ): string {
    let message = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      message = message.replace(regex, String(value));
    });
    return message;
  }

  /**
   * Builds WhatsApp URL with message (wa.me scheme)
   */
  static buildWhatsAppURL(phoneNumber: string, message: string): string {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      throw new Error('Invalid phone number');
    }
    
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  }

  /**
   * Opens WhatsApp with a message using wa.me URL scheme
   * This is the current implementation. Future: can be extended to use Business API
   */
  static sendMessage(options: WhatsAppMessageOptions): void {
    const { contact, message, phoneNumber } = options;
    
    const phone = phoneNumber || contact.contactNo;
    if (!phone) {
      throw new Error(`Contact "${contact.name}" does not have a phone number`);
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number format for "${contact.name}"`);
    }

    // Current implementation: wa.me URL scheme
    if (this.config.useBusinessAPI) {
      // Future: Implement WhatsApp Business API call
      // this.sendViaBusinessAPI(formattedPhone, message);
      throw new Error('WhatsApp Business API not yet implemented');
    } else {
      // Current: wa.me URL scheme
      const url = this.buildWhatsAppURL(formattedPhone, message);
      window.open(url, '_blank');
    }
  }

  /**
   * Generates invoice reminder message from template
   */
  static generateInvoiceReminder(
    template: string,
    contact: Contact,
    invoiceNumber: string,
    amount: number,
    dueDate?: string,
    subject?: string,
    unitName?: string
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      invoiceNumber,
      amount: `${CURRENCY} ${amount.toLocaleString()}`,
      dueDate: dueDate || '',
      subject: subject || 'your invoice',
      unitName: unitName || ''
    });
  }

  /**
   * Generates invoice receipt message from template
   */
  static generateInvoiceReceipt(
    template: string,
    contact: Contact,
    invoiceNumber: string,
    paidAmount: number,
    balance: number,
    subject?: string,
    unitName?: string
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      invoiceNumber,
      paidAmount: `${CURRENCY} ${paidAmount.toLocaleString()}`,
      balance: `${CURRENCY} ${balance.toLocaleString()}`,
      subject: subject || 'your invoice',
      unitName: unitName || ''
    });
  }

  /**
   * Generates bill payment message from template
   */
  static generateBillPayment(
    template: string,
    contact: Contact,
    billNumber: string,
    paidAmount: number
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      billNumber,
      paidAmount: `${CURRENCY} ${paidAmount.toLocaleString()}`
    });
  }

  /**
   * Generates vendor greeting message from template
   */
  static generateVendorGreeting(
    template: string,
    contact: Contact
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name
    });
  }

  /**
   * Generates custom message with template variables
   */
  static generateCustomMessage(
    template: string,
    variables: TemplateVariables
  ): string {
    return this.replaceTemplateVariables(template, variables);
  }

  /**
   * Future: Send message via WhatsApp Business API
   * This method will be implemented when Business API is integrated
   */
  private static async sendViaBusinessAPI(phoneNumber: string, message: string): Promise<void> {
    // TODO: Implement WhatsApp Business API integration
    // This will require:
    // - API endpoint configuration
    // - Authentication token
    // - Phone number ID
    // - API request handling
    throw new Error('WhatsApp Business API not yet implemented');
  }
}

