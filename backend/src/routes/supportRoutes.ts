import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { createSupportTicket } from '../services/support/supportTicketService.js';

export const supportRouter = Router();

const ticketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many ticket submissions. Please try again later.' },
  },
});

const ticketSchema = z.object({
  ticketType: z.enum(['contact', 'feature_request', 'bug_report']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  organization: z.string().max(200).optional(),
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(8000),
  metadata: z.record(z.unknown()).optional(),
  pageUrl: z.string().max(2000).optional(),
});

function supportEnabled(): boolean {
  return process.env.SUPPORT_TICKETS_ENABLED === 'true';
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

supportRouter.post('/support/tickets', ticketLimiter, async (req, res) => {
  if (!supportEnabled()) {
    sendFailure(res, 503, 'SUPPORT_DISABLED', 'Support ticket capture is not enabled on this server.');
    return;
  }

  try {
    const body = ticketSchema.parse(req.body ?? {});
    const ticket = await withTransaction((client) =>
      createSupportTicket(client, {
        ...body,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        ipAddress: clientIp(req),
      })
    );

    sendSuccess(res, {
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      status: ticket.status,
      ticketType: ticket.ticket_type,
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});
