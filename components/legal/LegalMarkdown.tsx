import React from 'react';

/** Minimal markdown-style renderer for legal document content. */
export const LegalMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');

  return (
    <article className="prose prose-slate max-w-none text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-3" />;
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={i} className="text-2xl font-bold text-slate-900 mt-2 mb-4">
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={i} className="text-lg font-semibold text-slate-800 mt-6 mb-2">
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          return (
            <p key={i} className="font-semibold text-slate-800 my-2">
              {trimmed.slice(2, -2)}
            </p>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <li key={i} className="ml-4 list-disc text-slate-700 my-1">
              {trimmed.slice(2)}
            </li>
          );
        }
        return (
          <p key={i} className="text-slate-700 my-2">
            {trimmed}
          </p>
        );
      })}
    </article>
  );
};

export const LEGAL_SLUGS = [
  { slug: 'terms-of-service', label: 'Terms of Service' },
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'subscription-agreement', label: 'Subscription Agreement' },
  { slug: 'refund-policy', label: 'Refund Policy' },
  { slug: 'data-retention-policy', label: 'Data Retention Policy' },
] as const;

export function legalPageUrl(slug: string): string {
  return `/legal/${slug}`;
}

export function openLegalDocument(slug: string): void {
  window.open(legalPageUrl(slug), '_blank', 'noopener,noreferrer');
}
