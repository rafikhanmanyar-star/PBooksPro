/**
 * Post-login organization picker (API mode).
 * Shown when the user belongs to multiple tenants, or when switching organization.
 */

import React, { useEffect, useState } from 'react';
import { Building2, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth, type CompanySummary } from '../../context/AuthContext';
import { getAppDisplayName } from '../../config/apiUrl';
import { formatApiErrorMessage } from '../../utils/formatApiErrorMessage';
import Button from '../ui/Button';

type CompanySelectionScreenProps = {
  mode: 'login' | 'switch';
  companies: CompanySummary[];
  preferredCompanyId?: string | null;
  selectionToken?: string | null;
  onBack?: () => void;
};

const CompanySelectionScreen: React.FC<CompanySelectionScreenProps> = ({
  mode,
  companies,
  preferredCompanyId,
  selectionToken,
  onBack,
}) => {
  const { selectCompany, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const preferred = preferredCompanyId
    ? companies.find((c) => c.id === preferredCompanyId)
    : undefined;
  const otherCompanies = preferred
    ? companies.filter((c) => c.id !== preferred.id)
    : companies;

  useEffect(() => {
    setError(null);
  }, [companies, selectionToken]);

  const handleSelect = async (companyId: string) => {
    setError(null);
    setSelectingId(companyId);
    try {
      await selectCompany(companyId, selectionToken ?? undefined, mode === 'switch');
    } catch (err: unknown) {
      setError(formatApiErrorMessage(err));
    } finally {
      setSelectingId(null);
    }
  };

  const title = mode === 'switch' ? 'Switch organization' : 'Welcome back';
  const subtitle =
    mode === 'switch'
      ? 'Choose which organization to work in'
      : 'Select the organization you want to open';

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-app-border bg-app-card p-8 shadow-ds-modal animate-slide-in-up">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Building2 className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-ds-small font-medium uppercase tracking-wide text-app-muted">
            {getAppDisplayName()}
          </p>
          <h1 className="mt-2 text-ds-h2 font-bold text-app-text">{title}</h1>
          <p className="mt-1 text-ds-body text-app-muted">{subtitle}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-ds-md border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}

        {preferred && (
          <div className="mb-4 space-y-2">
            <p className="text-ds-small font-semibold text-app-muted">Continue with</p>
            <Button
              type="button"
              disabled={isLoading}
              className="w-full justify-center !bg-emerald-600 hover:!bg-emerald-700"
              onClick={() => void handleSelect(preferred.id)}
            >
              {selectingId === preferred.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Opening…
                </>
              ) : (
                preferred.name
              )}
            </Button>
          </div>
        )}

        {otherCompanies.length > 0 && (
          <div className="space-y-2">
            {preferred && (
              <p className="text-ds-small font-semibold text-app-muted">
                {otherCompanies.length === 1 ? 'Or choose another' : 'Other organizations'}
              </p>
            )}
            {otherCompanies.map((company) => (
              <Button
                key={company.id}
                type="button"
                variant="outline"
                disabled={isLoading}
                className="w-full justify-center"
                onClick={() => void handleSelect(company.id)}
              >
                {selectingId === company.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Opening…
                  </>
                ) : (
                  company.name
                )}
              </Button>
            ))}
          </div>
        )}

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-6 flex w-full items-center justify-center gap-1.5 text-ds-body font-medium text-app-muted transition-colors hover:text-app-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {mode === 'switch' ? 'Cancel' : 'Back to sign in'}
          </button>
        )}
      </div>
    </div>
  );
};

export default CompanySelectionScreen;
