import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type SupportTicketType = 'contact' | 'feature_request' | 'bug_report';
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type SupportTicketRow = {
  id: string;
  ticket_number: string;
  ticket_type: SupportTicketType;
  status: string;
  priority: SupportTicketPriority;
  name: string;
  email: string;
  organization: string | null;
  subject: string;
  message: string;
  metadata: Record<string, unknown>;
  page_url: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSupportTicketInput = {
  ticketType: SupportTicketType;
  priority?: SupportTicketPriority;
  name: string;
  email: string;
  organization?: string;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
  pageUrl?: string;
  userAgent?: string;
  ipAddress?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateTicketNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `PBK-${date}-${suffix}`;
}

export async function createSupportTicket(
  client: pg.PoolClient,
  input: CreateSupportTicketInput
): Promise<SupportTicketRow> {
  const email = normalizeEmail(input.email);
  if (!email.includes('@')) {
    throw new Error('Valid email is required.');
  }

  const id = randomUUID();
  const ticketNumber = generateTicketNumber();
  const priority = input.priority ?? 'normal';

  const result = await client.query<SupportTicketRow>(
    `INSERT INTO support_tickets (
       id, ticket_number, ticket_type, status, priority,
       name, email, organization, subject, message, metadata,
       page_url, user_agent, ip_address
     ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
     RETURNING *`,
    [
      id,
      ticketNumber,
      input.ticketType,
      priority,
      input.name.trim(),
      email,
      input.organization?.trim() || null,
      input.subject.trim(),
      input.message.trim(),
      JSON.stringify(input.metadata ?? {}),
      input.pageUrl ?? null,
      input.userAgent ?? null,
      input.ipAddress ?? null,
    ]
  );

  return result.rows[0]!;
}
