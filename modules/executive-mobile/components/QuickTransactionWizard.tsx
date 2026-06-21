import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AmountInput from '../../../components/common/AmountInput';
import { useCreateUnpostedTransaction } from '../hooks/useUnpostedTransactions';
import { uploadUnpostedAttachment } from '../../../services/api/unpostedTransactionsApi';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useAuth } from '../../../context/AuthContext';
import { CURRENCY, ICONS } from '../../../constants';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';
import QuickCaptureStepper from './QuickCaptureStepper';
import RecentCapturesList from './RecentCapturesList';
import VoiceCapturePanel from './VoiceCapturePanel';
import QuickCaptureDetailsStep, { type DetailsFormState } from './QuickCaptureDetailsStep';
import QuickCaptureReceiptStep from './QuickCaptureReceiptStep';
import CreateCaptureTypeModal from './CreateCaptureTypeModal';
import MoneyFlowToggle from './MoneyFlowToggle';
import {
  getLastQuickCaptureSnapshot,
  getQuickCaptureSuggestions,
  saveQuickCaptureFields,
} from '../utils/quickCaptureFieldHistory';
import {
  isEntityPickerKind,
  isVendorPickerKind,
  QUICK_AMOUNT_PRESETS,
  WIZARD_STEPS,
} from '../constants/quickTransactionWizard';
import {
  captureTypesForFlow,
  captureTypeDisplayLabel,
  captureTypeIcon,
  defaultCaptureType,
  moneyFlowDirectionLabel,
  moneyFlowLabel,
  type CaptureType,
  type MoneyFlow,
} from '../constants/quickCaptureTypes';
import {
  loadCustomCaptureTypes,
  saveCustomCaptureType,
} from '../utils/customCaptureTypesStorage';
import {
  buildUnpostedPayload,
  reviewCaptureTypeLabel,
  stripCaptureDescriptionPrefix,
} from '../utils/captureSubmitMapping';
import { useQuickCaptureCatalog } from '../hooks/useQuickCaptureCatalog';
import type { ParsedVoiceCapture } from '../utils/parseVoiceQuickCapture';

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1]! : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatAmount(value: string): string {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return '—';
  return `${CURRENCY} ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

const EMPTY_DETAILS: DetailsFormState = {
  partyName: '',
  supplierId: '',
  employeeId: '',
  customerId: '',
  projectId: '',
  description: '',
};

export default function QuickTransactionWizard() {
  const { setView } = useExecutiveMode();
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const createMutation = useCreateUnpostedTransaction();
  const { projectItems } = useQuickCaptureCatalog();

  const [step, setStep] = useState(1);
  const [moneyFilter, setMoneyFilter] = useState<MoneyFlow>('out');
  const [captureType, setCaptureType] = useState<CaptureType>(defaultCaptureType('out'));
  const [customTypes, setCustomTypes] = useState<CaptureType[]>(() => loadCustomCaptureTypes(tenantId));
  const [showCreateType, setShowCreateType] = useState(false);
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState<DetailsFormState>(EMPTY_DETAILS);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [fieldSuggestions, setFieldSuggestions] = useState(() =>
    getQuickCaptureSuggestions(defaultCaptureType().id, tenantId)
  );

  const savedCustomTypes = useMemo(
    () => customTypes.filter((t) => (t.flow ?? 'out') === moneyFilter),
    [customTypes, moneyFilter]
  );

  const flowCaptureTypes = useMemo(
    () => captureTypesForFlow(moneyFilter),
    [moneyFilter]
  );

  useEffect(() => {
    setCustomTypes(loadCustomCaptureTypes(tenantId));
  }, [tenantId]);

  useEffect(() => {
    if (step === 1) {
      setCustomTypes(loadCustomCaptureTypes(tenantId));
    }
  }, [step, tenantId]);
  const currentStepMeta = WIZARD_STEPS[step - 1];
  const totalSteps = WIZARD_STEPS.length;

  const patchDetails = useCallback((patch: Partial<DetailsFormState>) => {
    setDetails((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetDetails = () => setDetails(EMPTY_DETAILS);

  const persistDetailFields = () => {
    saveQuickCaptureFields(
      captureType.id,
      {
        partyName: details.partyName,
        description: details.description,
        projectId: details.projectId,
      },
      tenantId
    );
    setFieldSuggestions(getQuickCaptureSuggestions(captureType.id, tenantId));
  };

  useEffect(() => {
    if (step !== 3) return;
    setFieldSuggestions(getQuickCaptureSuggestions(captureType.id, tenantId));
  }, [step, captureType.id, tenantId]);

  const resetWizard = () => {
    setStep(1);
    setMoneyFilter('out');
    setCaptureType(defaultCaptureType('out'));
    setCustomTypes(loadCustomCaptureTypes(tenantId));
    setAmount('');
    resetDetails();
    setAttachment(null);
    setVoiceTranscript(null);
    setSubmitted(false);
    setError(null);
    setShowCancelConfirm(false);
  };

  const hasWizardProgress =
    step > 1 ||
    Boolean(amount.trim()) ||
    Boolean(details.partyName.trim()) ||
    Boolean(details.supplierId) ||
    Boolean(details.employeeId) ||
    Boolean(details.projectId.trim()) ||
    Boolean(details.description.trim()) ||
    Boolean(attachment) ||
    Boolean(voiceTranscript);

  const completeCancel = () => {
    resetWizard();
    setView('home');
  };

  const requestCancel = () => {
    if (hasWizardProgress) {
      setShowCancelConfirm(true);
      return;
    }
    completeCancel();
  };

  const selectMoneyFlow = (flow: MoneyFlow) => {
    setMoneyFilter(flow);
    setCaptureType(defaultCaptureType(flow));
    setError(null);
    resetDetails();
    setVoiceTranscript(null);
  };

  const selectCaptureType = (type: CaptureType) => {
    setError(null);
    setVoiceTranscript(null);
    setCaptureType(type);
    resetDetails();
    setStep(2);
  };

  const handleCreateCustomType = (label: string) => {
    const created = saveCustomCaptureType(label, moneyFilter, tenantId);
    if (!created) return;
    setCustomTypes(loadCustomCaptureTypes(tenantId));
    setCaptureType(created);
    setError(null);
    resetDetails();
  };

  const applyVoiceParsed = (parsed: ParsedVoiceCapture) => {
    setError(null);
    setVoiceTranscript(parsed.rawTranscript);
    setAmount(String(parsed.amount));
    setMoneyFilter(parsed.moneyFlow);
    if (parsed.partyName) patchDetails({ partyName: parsed.partyName });
    if (parsed.projectId) patchDetails({ projectId: parsed.projectId });
    const flowTypes = [
      ...captureTypesForFlow(parsed.moneyFlow),
      ...customTypes.filter((t) => (t.flow ?? 'out') === parsed.moneyFlow),
    ];
    const matched =
      flowTypes.find((t) => t.id === parsed.captureTypeId) ??
      flowTypes.find((t) => t.kind === parsed.captureKind) ??
      defaultCaptureType(parsed.moneyFlow);
    setCaptureType(matched);
    setStep(parsed.confidence === 'high' ? 5 : 3);
  };

  const validateStep = (): boolean => {
    setError(null);
    if (step === 1 && !captureType) {
      setError('Select a transaction type');
      return false;
    }
    if (step === 2) {
      const parsed = Number(amount);
      if (!parsed || parsed <= 0) {
        setError('Enter a valid amount greater than zero');
        return false;
      }
    }
    if (step === 3) {
      if (isEntityPickerKind(captureType.kind, moneyFilter)) {
        if (isVendorPickerKind(captureType.kind, moneyFilter) && !details.supplierId) {
          setError('Select a vendor');
          return false;
        }
        if (captureType.kind === 'customer_collection' && !details.customerId) {
          setError('Select a customer');
          return false;
        }
        if (captureType.kind === 'staff' && !details.employeeId) {
          setError('Select a staff member');
          return false;
        }
      } else if (!details.partyName.trim()) {
        setError('Enter a name');
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    if (step === 3) persistDetailFields();
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const selectQuickAmount = (preset: number) => {
    setError(null);
    setAmount(String(preset));
    setStep(3);
  };

  const handleSubmit = async () => {
    setError(null);
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Enter a valid amount');
      setStep(2);
      return;
    }

    try {
      const payload = buildUnpostedPayload(captureType, {
        amount: parsedAmount,
        moneyFlow: moneyFilter,
        partyName: details.partyName,
        description: details.description,
        projectId: details.projectId,
        supplierId: details.supplierId,
        employeeId: details.employeeId,
        customerId: details.customerId,
        voiceTranscript,
      });

      const created = await createMutation.mutateAsync(payload);
      if (attachment) {
        const fileData = await fileToBase64(attachment);
        await uploadUnpostedAttachment(created.id, {
          fileName: attachment.name,
          mimeType: attachment.type || 'application/octet-stream',
          fileData,
        });
      }
      persistDetailFields();
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  const projectDisplayName =
    projectItems.find((p) => p.id === details.projectId)?.name ??
    (details.projectId.trim() || '—');

  const canShowHeaderNext = step < totalSteps && (step > 1 || captureType);
  const canShowHeaderSubmit = step === totalSteps;

  if (submitted) {
    return (
      <div className="p-6 pb-28 text-center space-y-4 executive-v2-page">
        <div className="w-16 h-16 mx-auto text-ds-primary">{ICONS.checkCircle}</div>
        <h2 className="text-lg font-bold">Submitted for review</h2>
        <p className="text-sm text-app-muted">
          Finance will process this transaction. You will get bell alerts as it moves through review.
        </p>
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-ds-primary text-white font-semibold touch-manipulation"
          onClick={resetWizard}
        >
          Record another
        </button>
        <button
          type="button"
          className="w-full py-3 text-ds-primary touch-manipulation"
          onClick={() => setView('myTransactions')}
        >
          View my submissions
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full executive-v2-page">
      <div className="px-4 pt-4 pb-3 border-b border-app-border/60 bg-app-card/95 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-0.5 h-10 -ml-1 px-2 text-ds-primary touch-manipulation shrink-0 rounded-xl"
                aria-label="Back to previous step"
              >
                <span className="w-5 h-5">{ICONS.chevronLeft}</span>
                <span className="text-sm font-semibold">Back</span>
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-ds-primary w-5 h-5 shrink-0">{ICONS.activity}</span>
                <h1 className="text-lg font-bold text-app-text">Quick Capture</h1>
              </div>
              <p className="text-xs text-app-muted mt-0.5 leading-snug">
                Record transactions in seconds. Finance team will review and post.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestCancel}
                className="text-xs font-semibold text-app-muted hover:text-ds-danger px-2 py-2 touch-manipulation"
              >
                Cancel
              </button>
              {canShowHeaderNext && (
                <button
                  type="button"
                  onClick={goNext}
                  className="text-xs font-bold text-white px-4 py-2 rounded-xl bg-ds-primary shadow-sm touch-manipulation"
                >
                  Next →
                </button>
              )}
              {canShowHeaderSubmit && (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={createMutation.isPending}
                  className="text-xs font-bold text-white px-4 py-2 rounded-xl bg-ds-primary shadow-sm touch-manipulation disabled:opacity-60"
                >
                  {createMutation.isPending ? 'Submitting…' : 'Submit'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setView('myTransactions')}
              className="text-xs font-semibold text-ds-primary px-3 py-1.5 rounded-xl border border-ds-primary/30 bg-ds-primary/5 touch-manipulation"
            >
              My Submissions
            </button>
          </div>
        </div>
        <QuickCaptureStepper currentStep={step} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-4">
        {step !== 1 && (
          <div className="mb-4">
            <h2 className="text-base font-semibold text-app-text">{currentStepMeta.title}</h2>
            <p className="text-sm text-app-muted">{currentStepMeta.subtitle}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-app-text">Select Transaction Type</h2>
                <p className="text-xs text-app-muted mt-0.5">
                  {moneyFilter === 'out'
                    ? 'Choose an expense type, then tap to continue'
                    : 'Choose an income type, then tap to continue'}
                </p>
              </div>
              <MoneyFlowToggle value={moneyFilter} onChange={selectMoneyFlow} align="end" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {flowCaptureTypes.map((t) => {
                const selected = captureType.id === t.id;
                const isIn = moneyFilter === 'in';
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectCaptureType(t)}
                    className={`qc-type-tile touch-manipulation ${
                      selected
                        ? isIn
                          ? 'qc-type-tile--in-selected'
                          : 'qc-type-tile--out-selected'
                        : ''
                    }`}
                  >
                    <span className={`qc-type-tile-icon ${selected ? 'qc-type-tile-icon--selected' : ''}`}>
                      <span className="w-5 h-5">{captureTypeIcon(t, moneyFilter)}</span>
                    </span>
                    <span className="text-[11px] font-semibold leading-tight text-center mt-1.5 line-clamp-2">
                      {captureTypeDisplayLabel(t, moneyFilter)}
                    </span>
                  </button>
                );
              })}

              {savedCustomTypes.map((t) => {
                const selected = captureType.id === t.id;
                const isIn = moneyFilter === 'in';
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectCaptureType(t)}
                    className={`qc-type-tile qc-type-tile--custom touch-manipulation ${
                      selected
                        ? isIn
                          ? 'qc-type-tile--in-selected'
                          : 'qc-type-tile--out-selected'
                        : ''
                    }`}
                  >
                    <span className={`qc-type-tile-icon ${selected ? 'qc-type-tile-icon--selected' : ''}`}>
                      <span className="w-5 h-5">{captureTypeIcon(t, moneyFilter)}</span>
                    </span>
                    <span className="text-[11px] font-semibold leading-tight text-center mt-1.5 line-clamp-2">
                      {t.label}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setShowCreateType(true)}
                className="qc-type-tile qc-type-tile--create touch-manipulation"
                aria-label="Add new transaction type"
              >
                <span className="qc-type-tile-icon qc-type-tile-icon--create">
                  <span className="w-5 h-5">{ICONS.plus}</span>
                </span>
                <span className="text-[11px] font-semibold leading-tight text-center mt-1.5 line-clamp-2">
                  Add type
                </span>
              </button>
            </div>

            <RecentCapturesList limit={4} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-app-card border border-app-border text-sm flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-ds-primary/10 text-ds-primary inline-flex items-center justify-center shrink-0">
                <span className="w-4 h-4">{captureTypeIcon(captureType, moneyFilter)}</span>
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-app-muted text-xs block">
                  {moneyFlowLabel(moneyFilter)} · {moneyFlowDirectionLabel(moneyFilter)}
                </span>
                <span className="font-semibold">{reviewCaptureTypeLabel(captureType, moneyFilter)}</span>
              </div>
            </div>
            <AmountInput
              label={`Amount (${CURRENCY})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-2xl font-bold text-center"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectQuickAmount(preset)}
                  className={`qc-amount-chip touch-manipulation ${
                    amount === String(preset) ? 'qc-amount-chip--selected' : ''
                  }`}
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <QuickCaptureDetailsStep
              captureType={captureType}
              moneyFlow={moneyFilter}
              value={details}
              onChange={patchDetails}
              fieldSuggestions={fieldSuggestions}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <QuickCaptureReceiptStep
              attachment={attachment}
              onAttachmentChange={setAttachment}
              onError={(msg) => setError(msg)}
            />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            {voiceTranscript && (
              <div className="rounded-xl border border-blue-300/50 bg-blue-50/80 dark:bg-blue-950/30 px-4 py-3">
                <p className="text-xs font-semibold text-ds-primary uppercase tracking-wide">Voice capture</p>
                <p className="text-sm text-app-text mt-1">&ldquo;{voiceTranscript}&rdquo;</p>
              </div>
            )}
            <div className="rounded-xl border border-app-border bg-app-card divide-y divide-app-border">
              <ReviewRow label="Direction" value={moneyFlowDirectionLabel(moneyFilter)} />
              <ReviewRow label="Type" value={reviewCaptureTypeLabel(captureType, moneyFilter)} />
              <ReviewRow label="Amount" value={formatAmount(amount)} highlight />
              <ReviewRow label="Party" value={details.partyName.trim() || '—'} />
              <ReviewRow label="Project" value={projectDisplayName} />
              <ReviewRow
                label="Notes"
                value={stripCaptureDescriptionPrefix(details.description.trim()) || '—'}
              />
              <ReviewRow label="Receipt" value={attachment ? attachment.name : 'None'} />
              <ReviewRow label="Date" value={todayLocalYyyyMmDd()} />
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-ds-danger">{error}</p>}
      </div>

      {step === 1 && (
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-app-border/40 bg-app-bg/95 backdrop-blur-sm">
          <VoiceCapturePanel
            disabled={createMutation.isPending}
            onParsed={applyVoiceParsed}
            onError={(msg) => setError(msg)}
          />
        </div>
      )}

      <CreateCaptureTypeModal
        open={showCreateType}
        moneyFlow={moneyFilter}
        onClose={() => setShowCreateType(false)}
        onCreated={handleCreateCustomType}
      />

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div
            className="w-full max-w-sm rounded-2xl bg-app-card border border-app-border shadow-xl p-5 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-capture-cancel-title"
          >
            <div>
              <h2 id="quick-capture-cancel-title" className="text-base font-bold text-app-text">
                Discard this capture?
              </h2>
              <p className="text-sm text-app-muted mt-1">
                Your entries will not be saved. You can start a new capture anytime.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-app-border text-sm font-semibold touch-manipulation"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={completeCancel}
                className="flex-1 py-2.5 rounded-xl bg-ds-danger text-white text-sm font-semibold touch-manipulation"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <span className="text-sm text-app-muted shrink-0">{label}</span>
      <span className={`text-sm text-right ${highlight ? 'font-bold text-lg text-app-text' : 'text-app-text'}`}>
        {value}
      </span>
    </div>
  );
}