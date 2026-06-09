import React, { useEffect, useState } from 'react';
import {
  legalApi,
  type LegalAcceptanceContext,
  type LegalAcceptanceInput,
  type LegalDocumentSummary,
} from '../../services/api/legalApi';
import { getFallbackLegalDocuments } from '../../services/api/legalFallback';
import { apiClient } from '../../services/api/client';
import { openLegalDocument } from './LegalMarkdown';

type Props = {
  context: LegalAcceptanceContext;
  checked: boolean;
  onChange: (checked: boolean, acceptances: LegalAcceptanceInput[]) => void;
  disabled?: boolean;
  /** API server root (no /api suffix) — syncs before fetching documents. */
  serverRootUrl?: string;
};

const LegalAcceptanceCheckbox: React.FC<Props> = ({
  context,
  checked,
  onChange,
  disabled,
  serverRootUrl,
}) => {
  const [docs, setDocs] = useState<LegalDocumentSummary[]>(() => getFallbackLegalDocuments(context));
  const [loadHint, setLoadHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (serverRootUrl?.trim()) {
          apiClient.setBaseUrl(serverRootUrl.trim());
        }
        const res = await legalApi.listDocuments(context);
        if (cancelled) return;
        if (res?.items?.length) {
          setDocs(res.items);
          setLoadHint(null);
        }
      } catch {
        if (cancelled) return;
        const fallback = getFallbackLegalDocuments(context);
        setDocs(fallback);
        if (fallback.length > 0) {
          setLoadHint('Using standard terms (API legal endpoint unavailable).');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context, serverRootUrl]);

  const handleToggle = (next: boolean) => {
    onChange(next, next ? legalApi.buildAcceptances(docs) : []);
  };

  if (docs.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        Legal documents could not be loaded. Check the API server URL and try again.
      </p>
    );
  }

  return (
    <div className="space-y-1 rounded-ds-md border border-app-border bg-slate-50 p-3 dark:bg-slate-900/40">
      {loadHint && <p className="text-xs text-amber-700">{loadHint}</p>}
      <label className="flex cursor-pointer select-none items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          checked={checked}
          disabled={disabled}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        <span className="text-sm leading-snug text-slate-700 dark:text-slate-300">
          <span className="font-medium text-slate-900 dark:text-slate-100">Required:</span> I agree to the{' '}
          {docs.map((doc, idx) => (
            <React.Fragment key={doc.type}>
              {idx > 0 && (idx === docs.length - 1 ? ' and ' : ', ')}
              <button
                type="button"
                className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                onClick={(e) => {
                  e.preventDefault();
                  openLegalDocument(doc.slug);
                }}
              >
                {doc.title}
              </button>
            </React.Fragment>
          ))}{' '}
          (version {docs[0]?.version}
          {docs.length > 1 ? ' et al.' : ''}).
        </span>
      </label>
    </div>
  );
};

export default LegalAcceptanceCheckbox;
