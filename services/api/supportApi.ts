import { apiClient } from './client';

export type SupportTicketType = 'contact' | 'feature_request' | 'bug_report';

export type CreateSupportTicketInput = {
  ticketType: SupportTicketType;
  name: string;
  email: string;
  subject: string;
  message: string;
  organization?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  pageUrl?: string;
};

export type CreateSupportTicketResponse = {
  ticketId: string;
  ticketNumber: string;
  status: string;
  ticketType: string;
};

export const supportApi = {
  async createTicket(input: CreateSupportTicketInput): Promise<CreateSupportTicketResponse> {
    return apiClient.post('/support/tickets', {
      ...input,
      pageUrl: input.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : undefined),
    });
  },
};
