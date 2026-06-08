import React, { useEffect, useState } from 'react';
import {
  legalApi,
  type LegalAcceptanceContext,
  type LegalAcceptanceInput,
  type LegalDocumentSummary,
} from '../../services/api/legalApi';
import { openLegalDocument } from './LegalMarkdown';

type Props = {
  context: LegalAcceptanceContext;
  checked: boolean;
  onChange: (checked: boolean, acceptances: LegalAcceptanceInput[]) => void;
  disabled?: boolean;
};

const LegalAcceptanceCheckbox: React.FC<Props> = ({ context, checked, onChange, disabled }) => {
  const [docs, setDocs] = useState<LegalDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await legalApi.listDocuments(context);
        setDocs(res.items);
      } finally {
        setLoading(false);
      }
    })();
  }, [context]);

  const handleToggle = (next: boolean) => {
    onChange(next, next ? legalApi.buildAcceptances(docs) : []);
  };

  if (loading) {
    return <p className="text-xs text-slate-500">Loading legal documents…</p>;
  }

  if (docs.length === 0) return null;

  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => handleToggle(e.target.checked)}
        required
      />
      <span className="text-sm text-slate-600 leading-snug">
        I agree to the{' '}
        {docs.map((doc, idx) => (
          <React.Fragment key={doc.type}>
            {idx > 0 && (idx === docs.length - 1 ? ' and ' : ', ')}
            <button
              type="button"
              className="text-indigo-600 hover:underline font-medium"
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
  );
};

export default LegalAcceptanceCheckbox;
