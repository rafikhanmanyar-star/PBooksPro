import React, { useEffect, useState } from 'react';
import { legalApi, type LegalDocumentDetail } from '../../services/api/legalApi';
import { LegalMarkdown, LEGAL_SLUGS, legalPageUrl } from './LegalMarkdown';

type Props = {
  slug?: string;
};

const LegalDocumentPage: React.FC<Props> = ({ slug: slugProp }) => {
  const slug =
    slugProp ??
    (typeof window !== 'undefined'
      ? window.location.pathname.replace(/^.*\/legal\//, '').replace(/\/$/, '')
      : '');

  const [doc, setDoc] = useState<LegalDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError('Document not specified.');
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        setDoc(await legalApi.getDocument(slug));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Document not found.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">PBooksPro Legal</p>
            <h1 className="text-lg font-bold text-slate-900">{doc?.title ?? 'Legal document'}</h1>
          </div>
          <button
            type="button"
            className="text-sm text-indigo-600 hover:underline"
            onClick={() => (window.location.href = '/')}
          >
            Back to app
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {doc && (
          <>
            <p className="text-sm text-slate-500 mb-6">
              Version {doc.version} · Effective {doc.effectiveDate}
            </p>
            <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
              <LegalMarkdown content={doc.content} />
            </div>
          </>
        )}

        <nav className="mt-10 pt-6 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-3">All legal documents</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {LEGAL_SLUGS.map((item) => (
              <li key={item.slug}>
                <a
                  href={legalPageUrl(item.slug)}
                  className={`hover:text-indigo-600 ${item.slug === slug ? 'text-indigo-600 font-medium' : 'text-slate-600'}`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
};

export default LegalDocumentPage;
