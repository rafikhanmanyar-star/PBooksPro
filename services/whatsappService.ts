import { Contact, Vendor, WhatsAppTemplates } from '../types';
import { CURRENCY } from '../constants';

/**
 * WhatsApp Service Module
 * 
 * This module provides a centralized service for WhatsApp integration.
 * Manual send: whatsapp:// deep link (installed app) with wa.me fallback; API path reserved for Business API.
 * 
 * @module whatsappService
 */

export interface WhatsAppMessageOptions {
  contact: Contact | Vendor;
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
   * Builds WhatsApp URL with message (wa.me — loads browser / web landing page)
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
   * Deep link for the installed WhatsApp app (skips api.whatsapp.com landing page).
   */
  static buildWhatsAppProtocolURL(phoneNumber: string, message: string): string {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      throw new Error('Invalid phone number');
    }
    const encodedMessage = encodeURIComponent(message);
    return `whatsapp://send?phone=${formattedPhone}&text=${encodedMessage}`;
  }

  private static openProtocolOrFallback(formattedPhone: string, message: string): void {
    const protocolUrl = this.buildWhatsAppProtocolURL(formattedPhone, message);
    const fallbackUrl = this.buildWhatsAppURL(formattedPhone, message);

    const api = (typeof window !== 'undefined'
      ? (window as unknown as {
          electronAPI?: { openWhatsAppSendUrl?: (url: string) => Promise<unknown> };
        }).electronAPI
      : undefined) as { openWhatsAppSendUrl?: (url: string) => Promise<unknown> } | undefined;

    if (api?.openWhatsAppSendUrl) {
      void api.openWhatsAppSendUrl(protocolUrl).catch(() => {
        window.open(fallbackUrl, '_blank');
      });
      return;
    }

    try {
      const a = document.createElement('a');
      a.href = protocolUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.open(fallbackUrl, '_blank');
    }
  }

  /**
   * Opens WhatsApp with a pre-filled message (installed app via whatsapp:// when possible).
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

    if (this.config.useBusinessAPI) {
      throw new Error('WhatsApp Business API not yet implemented');
    }

    this.openProtocolOrFallback(formattedPhone, message);
  }

  /**
   * Generates invoice reminder message from template
   */
  static generateInvoiceReminder(
    template: string,
    contact: Contact | Vendor,
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
    contact: Contact | Vendor,
    invoiceNumber: string,
    paidAmount: number,
    balance: number,
    subject?: string,
    unitName?: string,
    /** Sum of remaining balances on all open invoices for this contact (including `balance` on this invoice). */
    totalUnpaid?: number
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      invoiceNumber,
      paidAmount: `${CURRENCY} ${paidAmount.toLocaleString()}`,
      balance: `${CURRENCY} ${balance.toLocaleString()}`,
      subject: subject || 'your invoice',
      unitName: unitName || '',
      totalUnpaid:
        totalUnpaid !== undefined ? `${CURRENCY} ${totalUnpaid.toLocaleString()}` : ''
    });
  }

  /**
   * Generates bill payment message from template
   */
  static generateBillPayment(
    template: string,
    contact: Contact | Vendor,
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
    contact: Contact | Vendor
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name
    });
  }

  /**
   * Generates purchase order message for vendor (lineItems should be pre-formatted).
   */
  static generatePurchaseOrder(
    template: string,
    contact: Contact | Vendor,
    poNumber: string,
    issueDate: string,
    totalAmount: number,
    projectName: string,
    lineItems: string
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      poNumber,
      issueDate,
      totalAmount: `${CURRENCY} ${totalAmount.toLocaleString()}`,
      projectName: projectName || '—',
      lineItems: lineItems || 'No line items.',
    });
  }

  /**
   * Generates goods receipt (GRN) confirmation for vendor (lineItems should be pre-formatted).
   */
  static generateGoodsReceiptConfirmation(
    template: string,
    contact: Contact | Vendor,
    grnNumber: string,
    poNumber: string,
    receivedDate: string,
    totalAmount: number,
    projectName: string,
    lineItems: string
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      grnNumber,
      poNumber,
      receivedDate,
      totalAmount: `${CURRENCY} ${totalAmount.toLocaleString()}`,
      projectName: projectName || '—',
      lineItems: lineItems || 'No line items.',
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
   * Generates owner payout ledger summary message from template
   */
  static generateOwnerPayoutLedger(
    template: string,
    contact: Contact | Vendor,
    collected: number,
    expenses: number,
    paid: number,
    balance: number,
    payoutType?: string
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      collected: `${CURRENCY} ${collected.toLocaleString()}`,
      expenses: `${CURRENCY} ${expenses.toLocaleString()}`,
      paid: `${CURRENCY} ${paid.toLocaleString()}`,
      balance: `${CURRENCY} ${Math.abs(balance).toLocaleString()}`,
      payoutType: payoutType || 'Rental Income'
    });
  }

  /**
   * Generates broker payout ledger summary message from template
   */
  static generateBrokerPayoutLedger(
    template: string,
    contact: Contact | Vendor,
    earned: number,
    paid: number,
    balance: number
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      earned: `${CURRENCY} ${earned.toLocaleString()}`,
      paid: `${CURRENCY} ${paid.toLocaleString()}`,
      balance: `${CURRENCY} ${Math.abs(balance).toLocaleString()}`
    });
  }

  /**
   * Generates payout confirmation message from template
   */
  static generatePayoutConfirmation(
    template: string,
    contact: Contact | Vendor,
    amount: number,
    payoutType: string,
    reference?: string
  ): string {
    return this.replaceTemplateVariables(template, {
      contactName: contact.name,
      amount: `${CURRENCY} ${amount.toLocaleString()}`,
      payoutType,
      reference: reference || 'N/A'
    });
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

export type WhatsAppMode = 'api' | 'manual';

export interface SendOrOpenWhatsAppOptions {
  contact: Contact | Vendor;
  message: string;
  phoneNumber?: string;
}

/**
 * Routes WhatsApp action based on Settings > General whatsAppMode.
 * - manual: opens installed WhatsApp via whatsapp:// (wa.me fallback) so the user can send.
 * - api: opens in-app chat panel with pre-filled message.
 */
export function sendOrOpenWhatsApp(
  options: SendOrOpenWhatsAppOptions,
  getMode: () => WhatsAppMode,
  openChat: (contact: Contact | Vendor | null, phoneNumber?: string, initialMessage?: string) => void
): void {
  const { contact, message, phoneNumber } = options;
  const phone = phoneNumber ?? contact.contactNo;
  if (!phone) {
    throw new Error(`Contact "${contact.name}" does not have a phone number`);
  }
  if (getMode() === 'manual') {
    WhatsAppService.sendMessage({ contact, message, phoneNumber: phone });
  } else {
    openChat(contact, phone, message);
  }
}

