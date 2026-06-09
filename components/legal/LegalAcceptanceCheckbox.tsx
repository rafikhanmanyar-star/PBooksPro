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
  const [docs, setDocs] = useState<LegalDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadHint, setLoadHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadHint(null);
    onChange(false, []);

    void (async () => {
      try {
        if (serverRootUrl?.trim()) {
          apiClient.setBaseUrl(serverRootUrl.trim());
        }
        const res = await legalApi.listDocuments(context);
        const items = res?.items?.length ? res.items : getFallbackLegalDocuments(context);
        if (cancelled) return;
        setDocs(items);
        if (!res?.items?.length && items.length > 0) {
          setLoadHint('Using standard terms (could not load latest versions from the API).');
        }
      } catch {
        const fallback = getFallbackLegalDocuments(context);
        if (cancelled) return;
        setDocs(fallback);
        if (fallback.length > 0) {
          setLoadHint('Using standard terms (API legal endpoint unavailable).');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context, serverRootUrl]);

  const handleToggle = (next: boolean) => {
    onChange(next, next ? legalApi.buildAcceptances(docs) : []);
  };

  if (loading) {
    return <p className="text-xs text-slate-500">Loading legal documents…</p>;
  }

  if (docs.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        Legal documents could not be loaded. Check the API server URL and try again.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {loadHint && <p className="text-xs text-amber-700">{loadHint}</p>}
      <label className="flex cursor-pointer select-none items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          checked={checked}
          disabled={disabled}
          onChange={(e) => handleToggle(e.target.checked)}
          required
        />
        <span className="text-sm leading-snug text-slate-600">
          I agree to the{' '}
          {docs.map((doc, idx) => (
            <React.Fragment key={doc.type}>
              {idx > 0 && (idx === docs.length - 1 ? ' and ' : ', ')}
              <button
                type="button"
                className="font-medium text-indigo-600 hover:underline"
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
