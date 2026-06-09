import type { EmailAutomationEventType } from '../../constants/emailAutomation.js';

import { getEmailPublicBaseUrl, getAppUrl, getBillingUrl } from '../email/emailBrandLayout.js';

import { renderLifecycleTemplate, type EmailRenderContext } from '../email/emailTemplateLibrary.js';



export type TemplateRenderContext = {

  recipientName: string | null;

  tenantName: string | null;

  billingPortalUrl: string;

  appUrl: string;

  unsubscribeUrl: string;

  trialEndDate?: string;

  planName?: string;

  featureTitle?: string;

  featureBody?: string;

  customBody?: string;

  trackingToken: string;

};



function toRenderContext(ctx: TemplateRenderContext): EmailRenderContext {

  return {

    recipientName: ctx.recipientName,

    tenantName: ctx.tenantName,

    trackingToken: ctx.trackingToken,

    unsubscribeUrl: ctx.unsubscribeUrl,

    trialEndDate: ctx.trialEndDate,

    planName: ctx.planName,

    featureTitle: ctx.featureTitle,

    featureBody: ctx.featureBody,

    customBody: ctx.customBody,

  };

}



export function renderEmailText(

  eventType: EmailAutomationEventType,

  ctx: TemplateRenderContext

): string {

  return renderLifecycleTemplate(eventType, toRenderContext(ctx)).text;

}



export function renderEmailHtml(

  eventType: EmailAutomationEventType,

  ctx: TemplateRenderContext,

  _trackingPixelUrl?: string

): string {

  return renderLifecycleTemplate(eventType, toRenderContext(ctx)).html;

}



export function getPublicBaseUrl(): string {

  return getEmailPublicBaseUrl();

}



export function buildAppUrl(): string {

  return getAppUrl();

}



export function buildBillingPortalUrl(): string {

  return getBillingUrl();

}


