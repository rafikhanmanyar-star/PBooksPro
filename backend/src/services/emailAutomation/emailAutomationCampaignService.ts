import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EmailAutomationEventType } from '../../constants/emailAutomation.js';
import { enqueueAutomationEmail } from './emailAutomationQueueService.js';
import {
  EmailAutomationCampaignRepository,
} from '../../modules/email-automation/repositories/EmailAutomationRepository.js';

export type CampaignTargetFilter = {
  subscriptionStatus?: string[];
  inactiveDaysMin?: number;
};

export type CreateCampaignInput = {
  name: string;
  eventType: 'new_feature_announcement' | 're_engagement_campaign';
  subject: string;
  templateKey: string;
  bodyOverride?: string;
  targetFilter?: CampaignTargetFilter;
  scheduledAt?: Date;
  createdBy?: string;
  featureTitle?: string;
  featureBody?: string;
};

const campaignRepo = new EmailAutomationCampaignRepository();

export async function createCampaign(
  client: pg.PoolClient,
  input: CreateCampaignInput
): Promise<string> {
  const id = randomUUID();
  await campaignRepo.insert(client, {
    id,
    name: input.name,
    eventType: input.eventType,
    subject: input.subject,
    templateKey: input.templateKey,
    bodyOverride: input.bodyOverride ?? null,
    targetFilterJson: JSON.stringify(input.targetFilter ?? {}),
    scheduledAt: input.scheduledAt?.toISOString() ?? null,
    createdBy: input.createdBy ?? null,
  });
  return id;
}

export async function launchCampaign(
  client: pg.PoolClient,
  campaignId: string
): Promise<{ queued: number }> {
  const campaign = await campaignRepo.getById(client, campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  if (campaign.status === 'completed' || campaign.status === 'sending') {
    throw new Error('Campaign already launched.');
  }

  await campaignRepo.markSending(client, campaignId);

  const filter = (campaign.target_filter ?? {}) as CampaignTargetFilter;
  const statuses = filter.subscriptionStatus?.length
    ? filter.subscriptionStatus
    : ['active', 'trialing', 'expired', 'canceled'];
  const inactiveDays = filter.inactiveDaysMin ?? 0;

  const recipients = await campaignRepo.resolveCampaignRecipients(client, statuses, inactiveDays);
  let queued = 0;

  for (const recipient of recipients) {
    const id = await enqueueAutomationEmail(client, {
      tenantId: recipient.tenant_id,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      eventType: campaign.event_type as EmailAutomationEventType,
      dedupeKey: `${campaignId}:${recipient.tenant_id}:${recipient.email}`,
      campaignId,
      subjectOverride: campaign.subject as string,
      templateKeyOverride: campaign.template_key as string,
      customBody: (campaign.body_override as string | null) ?? undefined,
      metadata: {
        featureTitle: campaign.subject,
        featureBody: campaign.body_override ?? undefined,
        customBody: campaign.body_override ?? undefined,
      },
    });
    if (id) queued += 1;
  }

  await campaignRepo.markCompleted(client, campaignId, queued, recipients.length);

  return { queued };
}

export async function processScheduledCampaigns(client: pg.PoolClient): Promise<number> {
  const rows = await campaignRepo.listDueDrafts(client);

  let launched = 0;
  for (const row of rows) {
    await launchCampaign(client, row.id);
    launched += 1;
  }
  return launched;
}

export async function getAutomationStats(client: pg.PoolClient) {
  const row = await campaignRepo.getStats(client);
  return {
    pending: Number(row?.pending ?? 0),
    sent: Number(row?.sent ?? 0),
    failed: Number(row?.failed ?? 0),
    opened: Number(row?.opened ?? 0),
    clicked: Number(row?.clicked ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
  };
}
