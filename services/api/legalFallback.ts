import type { LegalAcceptanceContext, LegalDocumentSummary } from './legalApi';

/** Mirrors backend `constants/legalDocuments.ts` — used when /legal/documents is unreachable. */
const REGISTRATION_FALLBACK: LegalDocumentSummary[] = [
  {
    type: 'terms_of_service',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    version: '2026-06-07',
    effectiveDate: '2026-06-07',
    summary: 'Terms governing PBooksPro SaaS.',
    requiredFor: ['registration'],
  },
  {
    type: 'privacy_policy',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    version: '2026-06-07',
    effectiveDate: '2026-06-07',
    summary: 'How we collect, use, and protect your data.',
    requiredFor: ['registration'],
  },
];

export function getFallbackLegalDocuments(context: LegalAcceptanceContext): LegalDocumentSummary[] {
  if (context === 'registration') return REGISTRATION_FALLBACK;
  return [];
}
