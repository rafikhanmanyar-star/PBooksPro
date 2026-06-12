import nodemailer from 'nodemailer';

function createTransport() {
  const host =
    process.env.REPORT_SMTP_HOST ||
    process.env.EMAIL_AUTOMATION_SMTP_HOST ||
    process.env.DR_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(
      process.env.REPORT_SMTP_PORT ||
        process.env.EMAIL_AUTOMATION_SMTP_PORT ||
        process.env.DR_SMTP_PORT ||
        587
    ),
    secure: process.env.REPORT_SMTP_SECURE === 'true',
    auth:
      process.env.REPORT_SMTP_USER && process.env.REPORT_SMTP_PASS
        ? {
            user: process.env.REPORT_SMTP_USER,
            pass: process.env.REPORT_SMTP_PASS,
          }
        : process.env.EMAIL_AUTOMATION_SMTP_USER && process.env.EMAIL_AUTOMATION_SMTP_PASS
          ? {
              user: process.env.EMAIL_AUTOMATION_SMTP_USER,
              pass: process.env.EMAIL_AUTOMATION_SMTP_PASS,
            }
          : undefined,
  });
}

export async function sendScheduledReportEmail(opts: {
  to: string[];
  reportName: string;
  attachmentName: string;
  attachmentBuffer: Buffer;
  contentType: string;
}): Promise<void> {
  const from =
    process.env.REPORT_SMTP_FROM ||
    process.env.EMAIL_AUTOMATION_SMTP_FROM ||
    process.env.DR_SMTP_FROM ||
    'reports@pbookspro.local';

  if (process.env.REPORT_EMAIL_SEND_ENABLED !== 'true') {
    const { logger } = await import('../../../utils/logger.js');
    logger.info('[report-schedule] Would email report', {
      to: opts.to,
      reportName: opts.reportName,
      attachmentName: opts.attachmentName,
      bytes: opts.attachmentBuffer.length,
    });
    return;
  }

  const transport = createTransport();
  if (!transport) {
    throw new Error('REPORT_SMTP_NOT_CONFIGURED');
  }

  await transport.sendMail({
    from,
    to: opts.to.join(', '),
    subject: `Scheduled report: ${opts.reportName}`,
    text: `Your scheduled PBooks Pro report "${opts.reportName}" is attached.`,
    html: `<p>Your scheduled PBooks Pro report <strong>${opts.reportName}</strong> is attached.</p>`,
    attachments: [
      {
        filename: opts.attachmentName,
        content: opts.attachmentBuffer,
        contentType: opts.contentType,
      },
    ],
  });
}
