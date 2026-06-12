import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { withTransaction } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { publicIntrospectionLimiter } from '../../../middleware/introspectionGuard.js';
import {
  createDemoBooking,
  getDemoBookingByRef,
  validateMobileNumber,
} from '../../../services/demo/demoBookingService.js';
import { getDemoBookingPublicConfig } from '../../../services/demo/demoBookingEmailService.js';

export const demoBookingRouter = Router();

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many demo requests. Please try again later.' },
  },
});

const BUSINESS_TYPES = [
  'property_manager',
  'construction_developer',
  'real_estate_broker',
  'accounting_firm',
  'enterprise',
  'other',
] as const;

const USER_COUNTS = ['1-5', '6-20', '21-50', '51-100', '100+'] as const;

const PREFERRED_TIMES = ['morning', 'afternoon', 'evening'] as const;

const bookingSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  companyName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  mobileNumber: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .refine(validateMobileNumber, 'Enter a valid mobile number (10–15 digits).'),
  city: z.string().trim().min(2).max(120),
  userCount: z.enum(USER_COUNTS),
  businessType: z.enum(BUSINESS_TYPES),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  preferredTime: z.enum(PREFERRED_TIMES).optional().or(z.literal('').transform(() => undefined)),
  additionalNotes: z.string().max(4000).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  pageUrl: z.string().max(2000).optional(),
  formStartedAt: z.number().int().positive().optional(),
  honeypot: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function bookingsEnabled(): boolean {
  return process.env.DEMO_BOOKING_ENABLED !== 'false';
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

demoBookingRouter.get('/demo/bookings/config', publicIntrospectionLimiter, (_req, res) => {
  sendSuccess(res, {
    enabled: bookingsEnabled(),
    ...getDemoBookingPublicConfig(),
  });
});

demoBookingRouter.get('/demo/bookings/:ref', publicIntrospectionLimiter, async (req, res) => {
  if (!bookingsEnabled()) {
    sendFailure(res, 503, 'DEMO_BOOKING_DISABLED', 'Demo booking is not enabled.');
    return;
  }

  try {
    const booking = await getDemoBookingByRef(req.params.ref);
    if (!booking) {
      sendFailure(res, 404, 'NOT_FOUND', 'Booking not found.');
      return;
    }

    sendSuccess(res, {
      bookingRef: booking.booking_ref,
      status: booking.status,
      fullName: booking.full_name,
      companyName: booking.company_name,
      preferredDate: booking.preferred_date,
      preferredTime: booking.preferred_time,
      calendarEventUrl: booking.calendar_event_url,
      createdAt: booking.created_at,
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /demo/bookings/:ref' });
  }
});

demoBookingRouter.post('/demo/bookings', bookingLimiter, async (req, res) => {
  if (!bookingsEnabled()) {
    sendFailure(res, 503, 'DEMO_BOOKING_DISABLED', 'Demo booking is not enabled on this server.');
    return;
  }

  try {
    const body = bookingSchema.parse(req.body ?? {});
    const result = await withTransaction((client) =>
      createDemoBooking(client, {
        ...body,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        ipAddress: clientIp(req),
      })
    );

    const config = getDemoBookingPublicConfig();
    const successUrl = `${(process.env.MARKETING_SITE_URL || 'https://www.pbookspro.com').replace(/\/$/, '')}${config.successPagePath}?ref=${encodeURIComponent(result.booking.booking_ref)}`;

    sendSuccess(
      res,
      {
        bookingId: result.booking.id,
        bookingRef: result.booking.booking_ref,
        leadId: result.leadId,
        status: result.booking.status,
        emailsSent: result.emailsSent,
        successUrl,
        calendlyUrl: result.booking.calendar_event_url,
      },
      201
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'SPAM_DETECTED') {
      sendFailure(res, 400, 'SPAM_DETECTED', 'Submission could not be processed.');
      return;
    }
    if (code === 'FORM_TOO_FAST') {
      sendFailure(res, 400, 'FORM_TOO_FAST', 'Please take a moment to complete the form.');
      return;
    }
    handleRouteError(res, e, { route: 'POST /demo/bookings' });
  }
});
