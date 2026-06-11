import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { createMarketingLead } from '../marketing/marketingLeadService.js';
import {
  sendDemoBookingAdminNotification,
  sendDemoBookingConfirmation,
} from './demoBookingEmailService.js';
import { logger } from '../../utils/logger.js';
import { DemoBookingRepository } from '../../modules/demo/repositories/DemoRepository.js';

export type DemoBookingRow = {
  id: string;
  booking_ref: string;
  lead_id: string | null;
  full_name: string;
  company_name: string;
  email: string;
  mobile_number: string;
  city: string;
  user_count: string;
  business_type: string;
  preferred_date: string | null;
  preferred_time: string | null;
  additional_notes: string | null;
  status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  page_url: string | null;
  user_agent: string | null;
  ip_address: string | null;
  calendar_provider: string | null;
  calendar_event_url: string | null;
  confirmation_email_sent_at: string | null;
  admin_notified_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateDemoBookingInput = {
  fullName: string;
  companyName: string;
  email: string;
  mobileNumber: string;
  city: string;
  userCount: string;
  businessType: string;
  preferredDate?: string;
  preferredTime?: string;
  additionalNotes?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  pageUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  formStartedAt?: number;
  honeypot?: string;
  metadata?: Record<string, unknown>;
};

const bookingRepo = new DemoBookingRepository();

function bookingRefFromId(id: string): string {
  return `DEMO-${id.slice(0, 8).toUpperCase()}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function digitsOnlyPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function validateMobileNumber(phone: string): boolean {
  const digits = digitsOnlyPhone(phone);
  return digits.length >= 10 && digits.length <= 15;
}

export function assertNotSpam(input: CreateDemoBookingInput): void {
  if (input.honeypot && input.honeypot.trim().length > 0) {
    throw Object.assign(new Error('Submission rejected.'), { code: 'SPAM_DETECTED' });
  }
  if (input.formStartedAt) {
    const elapsed = Date.now() - input.formStartedAt;
    if (elapsed < 2500) {
      throw Object.assign(new Error('Please take a moment to complete the form.'), {
        code: 'FORM_TOO_FAST',
      });
    }
  }
}

export async function createDemoBooking(
  client: pg.PoolClient,
  input: CreateDemoBookingInput
): Promise<{ booking: DemoBookingRow; leadId: string; emailsSent: boolean }> {
  assertNotSpam(input);

  const email = normalizeEmail(input.email);
  if (!email.includes('@')) {
    throw new Error('Valid email is required.');
  }
  if (!validateMobileNumber(input.mobileNumber)) {
    throw new Error('Enter a valid mobile number (10–15 digits).');
  }

  const id = randomUUID();
  const bookingRef = bookingRefFromId(id);
  const calendlyUrl = process.env.DEMO_BOOKING_CALENDLY_URL?.trim() || null;

  const leadResult = await createMarketingLead(client, {
    source: 'demo_booking',
    leadMagnet: 'demo-booking',
    name: input.fullName.trim(),
    email,
    company: input.companyName.trim(),
    country: input.city.trim(),
    mobile: input.mobileNumber.trim(),
    campaign: input.utmCampaign,
    status: 'demo_scheduled',
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    pageUrl: input.pageUrl,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
    metadata: {
      bookingRef,
      mobileNumber: input.mobileNumber.trim(),
      userCount: input.userCount,
      businessType: input.businessType,
      preferredDate: input.preferredDate,
      preferredTime: input.preferredTime,
      ...(input.metadata ?? {}),
    },
  });

  const booking = await bookingRepo.insert(client, [
    id,
    bookingRef,
    leadResult.lead.id,
    input.fullName.trim(),
    input.companyName.trim(),
    email,
    input.mobileNumber.trim(),
    input.city.trim(),
    input.userCount,
    input.businessType,
    input.preferredDate || null,
    input.preferredTime || null,
    input.additionalNotes?.trim() || null,
    input.utmSource ?? null,
    input.utmMedium ?? null,
    input.utmCampaign ?? null,
    input.pageUrl ?? null,
    input.userAgent ?? null,
    input.ipAddress ?? null,
    calendlyUrl ? 'calendly' : null,
    calendlyUrl,
    JSON.stringify(input.metadata ?? {}),
  ]);

  let emailsSent = false;

  if (process.env.DEMO_BOOKING_EMAIL_ENABLED !== 'false') {
    try {
      await sendDemoBookingConfirmation(booking);
      await sendDemoBookingAdminNotification(booking);
      await bookingRepo.markEmailsSent(client, booking.id);
      emailsSent = true;
    } catch (err) {
      logger.warn('demo_booking_email_failed', {
        bookingId: booking.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { booking, leadId: leadResult.lead.id, emailsSent };
}

export async function getDemoBookingByRef(ref: string): Promise<DemoBookingRow | null> {
  return bookingRepo.getByRef(getPool(), ref);
}
