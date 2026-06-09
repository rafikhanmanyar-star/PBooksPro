import { randomUUID } from 'node:crypto';
import type { DemoBookingRow } from './demoBookingService.js';
import { sendMarketingEmail } from '../marketing/marketingEmailSender.js';

function adminAddress(): string {
  return (
    process.env.DEMO_BOOKING_ADMIN_EMAIL ||
    process.env.MARKETING_ADMIN_EMAIL ||
    'support@pbookspro.com'
  );
}

function successPageUrl(bookingRef: string): string {
  const base =
    process.env.DEMO_BOOKING_SUCCESS_URL ||
    process.env.MARKETING_SITE_URL ||
    'https://www.pbookspro.com';
  return `${base.replace(/\/$/, '')}/demo-success.html?ref=${encodeURIComponent(bookingRef)}`;
}

function calendlyUrl(): string | undefined {
  const url = process.env.DEMO_BOOKING_CALENDLY_URL?.trim();
  return url || undefined;
}

function formatPreferredSlot(booking: DemoBookingRow): string {
  const parts: string[] = [];
  if (booking.preferred_date) {
    parts.push(booking.preferred_date);
  }
  if (booking.preferred_time) {
    parts.push(booking.preferred_time.replace(/_/g, ' '));
  }
  return parts.length ? parts.join(' · ') : 'Flexible — our team will propose times';
}

function renderAdminText(booking: DemoBookingRow): string {
  return [
    'New demo booking request',
    '',
    `Reference: ${booking.booking_ref}`,
    `Name: ${booking.full_name}`,
    `Company: ${booking.company_name}`,
    `Email: ${booking.email}`,
    `Mobile: ${booking.mobile_number}`,
    `City: ${booking.city}`,
    `Users: ${booking.user_count}`,
    `Business type: ${booking.business_type}`,
    `Preferred: ${formatPreferredSlot(booking)}`,
    booking.additional_notes ? `Notes: ${booking.additional_notes}` : '',
    booking.page_url ? `Page: ${booking.page_url}` : '',
    '',
    `Lead ID: ${booking.lead_id ?? 'n/a'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendDemoBookingConfirmation(booking: DemoBookingRow): Promise<string> {
  const trackingToken = randomUUID();
  const calendly = calendlyUrl();

  return sendMarketingEmail({
    to: booking.email,
    name: booking.full_name,
    subject: `Your PBooks Pro demo request (${booking.booking_ref})`,
    templateKey: 'demo_confirmation',
    trackingToken,
    context: {
      bookingRef: booking.booking_ref,
      companyName: booking.company_name,
      preferredSlot: formatPreferredSlot(booking),
      calendlyUrl: calendly,
      bookingStatusUrl: successPageUrl(booking.booking_ref),
    },
  });
}

export async function sendDemoBookingAdminNotification(booking: DemoBookingRow): Promise<void> {
  if (process.env.MARKETING_EMAIL_SEND_ENABLED !== 'true') {
    const { logger } = await import('../../utils/logger.js');
    logger.info('[demo-booking] Would notify admin', { bookingRef: booking.booking_ref });
    return;
  }

  const nodemailer = await import('nodemailer');
  const host =
    process.env.MARKETING_SMTP_HOST ||
    process.env.EMAIL_AUTOMATION_SMTP_HOST ||
    process.env.DR_SMTP_HOST;
  if (!host) {
    throw new Error('SMTP is not configured for demo booking emails');
  }

  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.MARKETING_SMTP_PORT || process.env.EMAIL_AUTOMATION_SMTP_PORT || 587),
    secure: process.env.MARKETING_SMTP_SECURE === 'true',
    auth:
      process.env.MARKETING_SMTP_USER && process.env.MARKETING_SMTP_PASS
        ? { user: process.env.MARKETING_SMTP_USER, pass: process.env.MARKETING_SMTP_PASS }
        : undefined,
  });

  const from =
    process.env.DEMO_BOOKING_EMAIL_FROM ||
    process.env.MARKETING_EMAIL_FROM ||
    'hello@pbookspro.com';

  await transport.sendMail({
    from,
    to: adminAddress(),
    replyTo: booking.email,
    subject: `[Demo Booking] ${booking.company_name} — ${booking.full_name}`,
    text: renderAdminText(booking),
  });
}

export function getDemoBookingPublicConfig() {
  const calendly = calendlyUrl();
  return {
    calendlyUrl: calendly,
    schedulingProvider: calendly ? 'calendly' : null,
    successPagePath: '/demo-success.html',
    minFormFillMs: 3000,
  };
}
