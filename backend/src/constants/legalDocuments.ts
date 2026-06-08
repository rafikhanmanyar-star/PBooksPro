/**
 * Legal document registry — versions, slugs, and content.
 */

export type LegalDocumentType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'subscription_agreement'
  | 'refund_policy'
  | 'data_retention_policy';

export type LegalAcceptanceContext = 'registration' | 'checkout' | 'general';

export type LegalDocumentDefinition = {
  type: LegalDocumentType;
  slug: string;
  title: string;
  version: string;
  effectiveDate: string;
  summary: string;
  content: string;
  requiredFor: LegalAcceptanceContext[];
};

export const LEGAL_DOCUMENTS: LegalDocumentDefinition[] = [
  {
    type: 'terms_of_service',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    version: '2026-06-07',
    effectiveDate: '2026-06-07',
    summary: 'Terms governing PBooksPro SaaS — license, subscriptions, refunds, acceptable use, data ownership, and liability.',
    requiredFor: ['registration'],
    content: `# Terms of Service

**Version:** 2026-06-07  
**Effective date:** June 7, 2026

Full text published at: https://www.pbookspro.com/terms.html

## 1. Agreement
By using PBooksPro you agree to these Terms and the Privacy Policy.

## 2. Software license
Limited, non-exclusive, revocable license for internal business use. No reverse engineering, resale, or competing use.

## 3. Subscription terms
Monthly/annual plans, 30-day trials, auto-renewal, taxes, upgrades/downgrades per pricing page.

## 4. Refund policy
7-day (monthly) / 14-day (annual) first-purchase windows; renewals non-refundable unless required by law.

## 5. Account responsibilities
Accurate information, credential security, authorized user activity, compliance with law.

## 6. Acceptable use
No unlawful content, abuse, unauthorized access, or license circumvention.

## 7. Data ownership
Customer Data remains yours; limited license to host/process; export on termination.

## 8. Service availability
As-is/as-available; maintenance and feature changes with notice where practicable.

## 9. Limitation of liability
Cap: fees paid in prior 12 months or USD $100, except where prohibited.

## 10. Termination
Cancel at period end; we may suspend for breach, non-payment, or security risk.

## 11. Contact
legal@pbookspro.com or PBooksPro support.`,
  },
  {
    type: 'privacy_policy',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    version: '2026-06-07',
    effectiveDate: '2026-06-07',
    summary: 'How we collect, use, and protect personal and business data — GDPR-ready with UAE and international guidance.',
    requiredFor: ['registration'],
    content: `# Privacy Policy

**Version:** 2026-06-07  
**Effective date:** June 7, 2026

Full text published at: https://www.pbookspro.com/privacy.html

## 1. Introduction
PBooksPro provides accounting, property management, and construction costing software. This policy explains our data practices for website visitors, trial users, and subscribers worldwide, including GDPR and UAE PDPL considerations.

## 2. Data we collect
Account and identity data; business and financial records you enter; communications; technical, security, and usage logs; and payment metadata from processors (not full card numbers).

## 3. Cookies
We use strictly necessary, functional, analytics, and marketing cookies where permitted. You may control cookies via browser settings.

## 4. User accounts
Organization administrators manage users and roles. Multi-tenant isolation and audit trails protect business data.

## 5. Payment processing
Subscriptions are processed by PCI-compliant providers such as Paddle. We retain billing identifiers and status, not full payment card data.

## 6. Legal bases (GDPR)
Contract, legitimate interests, consent (where required), and legal obligation.

## 7. Data security
TLS encryption, RBAC, audit logging, backups, and subprocessors under contractual safeguards.

## 8. Your rights
Access, rectification, erasure, restriction, portability, objection, withdraw consent, and lodge a complaint with a supervisory authority where applicable.

## 9. International & UAE customers
Cross-border transfers use appropriate safeguards. UAE customers are processed per Federal Decree-Law No. 45 of 2021.

## 10. Retention & sharing
Retention follows our Data Retention Policy. We share data with subprocessors and when required by law. We do not sell personal data.

## 11. Changes
Material updates will revise the version and effective date and may require renewed acceptance.

## 12. Contact
privacy@pbookspro.com or PBooksPro support.`,
  },
  {
    type: 'subscription_agreement',
    slug: 'subscription-agreement',
    title: 'Subscription Agreement',
    version: '2026-06-01',
    effectiveDate: '2026-06-01',
    summary: 'Subscription terms, billing cycles, and plan limits.',
    requiredFor: ['checkout'],
    content: `# Subscription Agreement

**Effective date:** June 1, 2026

## 1. Subscription plans
PBooksPro offers trial, Starter, Professional, and Business tiers with defined user, project, and storage limits. Current limits and pricing are shown at checkout.

## 2. Billing
Subscriptions bill monthly or annually through Paddle. By subscribing, you authorize recurring charges until cancellation.

## 3. Trials
Free trials convert to paid plans unless canceled before the trial end date. One trial per organization unless otherwise approved.

## 4. Upgrades and downgrades
Plan changes may take effect immediately or at the next billing period. Proration follows Paddle billing rules.

## 5. Usage limits
Exceeding plan limits may restrict creation of users, projects, invoices, or payroll runs until you upgrade.

## 6. Cancellation
You may cancel at period end through the billing portal. Access continues until the paid period expires.

## 7. Taxes
Prices exclude applicable taxes unless stated. You are responsible for indirect taxes where required.

## 8. Service levels
We target high availability but do not guarantee uninterrupted service. Scheduled maintenance will be communicated when practicable.

## 9. Entire agreement
This Subscription Agreement supplements the Terms of Service for paid subscriptions.`,
  },
  {
    type: 'refund_policy',
    slug: 'refund-policy',
    title: 'Refund Policy',
    version: '2026-06-01',
    effectiveDate: '2026-06-01',
    summary: 'Conditions under which subscription payments may be refunded.',
    requiredFor: ['checkout'],
    content: `# Refund Policy

**Effective date:** June 1, 2026

## 1. General policy
Subscription fees are generally non-refundable except as stated below or required by applicable consumer protection law.

## 2. Trial period
No charges apply during an active free trial. Cancel before trial end to avoid billing.

## 3. Monthly subscriptions
Monthly plans may be eligible for a pro-rata refund within 7 days of initial purchase if you have not materially used paid features beyond trial limits. Contact support with your invoice reference.

## 4. Annual subscriptions
Annual plans may receive a pro-rata refund within 14 days of initial purchase, minus any discounts applied, if requested in writing.

## 5. Non-refundable items
Renewals, add-on fees, taxes, and charges after the refund window are not refundable unless mandated by law.

## 6. Chargebacks
Initiating a chargeback without contacting support may result in account suspension pending investigation.

## 7. How to request a refund
Submit requests through the Paddle customer portal or PBooksPro support with organization ID, invoice number, and reason.

## 8. Processing time
Approved refunds are processed to the original payment method within 5–10 business days via Paddle.`,
  },
  {
    type: 'data_retention_policy',
    slug: 'data-retention-policy',
    title: 'Data Retention Policy',
    version: '2026-06-01',
    effectiveDate: '2026-06-01',
    summary: 'How long we retain account and business data.',
    requiredFor: [],
    content: `# Data Retention Policy

**Effective date:** June 1, 2026

## 1. Active accounts
While your subscription is active, we retain your business data to provide the Service, including backups for disaster recovery.

## 2. Trial accounts
Trial data is retained for 30 days after trial expiration, then scheduled for deletion unless converted to a paid plan.

## 3. Canceled subscriptions
After cancellation, data remains accessible until the end of the paid period. Thereafter, data enters a 90-day retention window for export requests, then is deleted from production systems.

## 4. Backups
Encrypted backups may persist up to 180 days after primary deletion for recovery and legal compliance, then are purged.

## 5. Audit and billing records
Legal acceptance logs, invoices, and audit trails are retained for 7 years or as required by tax and accounting regulations.

## 6. Export
You may export data through PBooksPro backup and reporting features before deletion.

## 7. Legal holds
Data subject to litigation or regulatory hold is retained until the hold is released.

## 8. Contact
For retention questions or early deletion requests, contact PBooksPro support.`,
  },
];

export function getLegalDocumentByType(type: string): LegalDocumentDefinition | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.type === type);
}

export function getLegalDocumentBySlug(slug: string): LegalDocumentDefinition | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

export function getRequiredDocuments(context: LegalAcceptanceContext): LegalDocumentDefinition[] {
  return LEGAL_DOCUMENTS.filter((d) => d.requiredFor.includes(context));
}

export function listLegalDocumentsPublic(context?: LegalAcceptanceContext) {
  const docs = context ? getRequiredDocuments(context) : LEGAL_DOCUMENTS;
  return docs.map((d) => ({
    type: d.type,
    slug: d.slug,
    title: d.title,
    version: d.version,
    effectiveDate: d.effectiveDate,
    summary: d.summary,
    requiredFor: d.requiredFor,
  }));
}

export function validateAcceptancePayload(
  acceptances: Array<{ documentType: string; documentVersion: string }>,
  context: LegalAcceptanceContext
): { valid: boolean; missing: string[]; invalid: string[] } {
  const required = getRequiredDocuments(context).map((d) => d.type);
  const provided = new Map(acceptances.map((a) => [a.documentType, a.documentVersion]));
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const type of required) {
    const version = provided.get(type);
    if (!version) {
      missing.push(type);
      continue;
    }
    const doc = getLegalDocumentByType(type);
    if (!doc || doc.version !== version) {
      invalid.push(type);
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}
