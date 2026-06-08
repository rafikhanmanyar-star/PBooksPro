import { apiClient } from './client';

export type LegalDocumentSummary = {
  type: string;
  slug: string;
  title: string;
  version: string;
  effectiveDate: string;
  summary: string;
  requiredFor: string[];
};

export type LegalDocumentDetail = LegalDocumentSummary & {
  content: string;
};

export type LegalAcceptanceInput = {
  documentType: string;
  documentVersion: string;
};

export type LegalAcceptanceContext = 'registration' | 'checkout' | 'general';

export const legalApi = {
  async listDocuments(context?: LegalAcceptanceContext): Promise<{
    items: LegalDocumentSummary[];
    count: number;
  }> {
    const qs = context ? `?context=${encodeURIComponent(context)}` : '';
    return apiClient.get(`/legal/documents${qs}`);
  },

  async getDocument(slug: string): Promise<LegalDocumentDetail> {
    return apiClient.get(`/legal/documents/${slug}`);
  },

  async accept(
    acceptances: LegalAcceptanceInput[],
    context: LegalAcceptanceContext = 'general'
  ): Promise<{ recorded: unknown[]; count: number }> {
    return apiClient.post('/legal/accept', { acceptances, context });
  },

  buildAcceptances(docs: LegalDocumentSummary[]): LegalAcceptanceInput[] {
    return docs.map((d) => ({ documentType: d.type, documentVersion: d.version }));
  },
};
