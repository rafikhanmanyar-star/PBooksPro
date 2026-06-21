import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import CreateCaptureTypeModal from './CreateCaptureTypeModal';
import {
  getLastQuickCaptureSnapshot,
  getQuickCaptureSuggestions,
  saveQuickCaptureFields,
} from '../utils/quickCaptureFieldHistory';
import {
  isEntityPickerKind,
  QUICK_AMOUNT_PRESETS,
  WIZARD_STEPS,
} from '../constants/quickTransactionWizard';
import {
  CORE_CAPTURE_TYPES,
  captureTypeIcon,
  defaultCaptureType,
  type CaptureType,
} from '../constants/quickCaptureTypes';
import {
  loadCustomCaptureTypes,
  saveCustomCaptureType,
} from '../utils/customCaptureTypesStorage';
import {
  buildUnpostedPayload,
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
  projectId: '',
  description: '',
};

export default function QuickTransactionWizard() {
  const { setView } = useExecutiveMode();
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const createMutation = useCreateUnpostedTransaction();
  const fileRef = useRef<HTMLInputElement>(null);
  const { projectItems } = useQuickCaptureCatalog();

  const [step, setStep] = useState(1);
  const [captureType, setCaptureType] = useState<CaptureType>(defaultCaptureType);
  const [customTypes, setCustomTypes] = useState<CaptureType[]>(() => loadCustomCaptureTypes(tenantId));
  const [showCreateType, setShowCreateType] = useState(false);
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState<DetailsFormState>(EMPTY_DETAILS);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldSuggestions, setFieldSuggestions] = useState(() =>
    getQuickCaptureSuggestions(defaultCaptureType().id, tenantId)
  );

  const allTypes = useMemo(() => [...CORE_CAPTURE_TYPES, ...customTypes], [customTypes]);
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
    setCaptureType(defaultCaptureType());
    setAmount('');
    resetDetails();
    setAttachment(null);
    setVoiceTranscript(null);
    setSubmitted(false);
    setError(null);
  };

  const selectCaptureType = (type: CaptureType) => {
    setError(null);
    setVoiceTranscript(null);
    setCaptureType(type);
    resetDetails();
    setStep(2);
  };

  const handleCreateCustomType = (label: string) => {
    const created = saveCustomCaptureType(label, tenantId);
    if (!created) return;
    setCustomTypes(loadCustomCaptureTypes(tenantId));
    selectCaptureType(created);
  };

  const applyVoiceParsed = (parsed: ParsedVoiceCapture) => {
    setError(null);
    setVoiceTranscript(parsed.rawTranscript);
    setAmount(String(parsed.amount));
    if (parsed.partyName) patchDetails({ partyName: parsed.partyName });
    if (parsed.projectId) patchDetails({ projectId: parsed.projectId });
    const matched =
      allTypes.find((t) => t.id === parsed.captureTypeId) ??
      CORE_CAPTURE_TYPES.find((t) => t.kind === parsed.captureKind) ??
      defaultCaptureType();
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
      if (isEntityPickerKind(captureType.kind)) {
        if (captureType.kind === 'suppliers' && !details.supplierId) {
          setError('Select a vendor');
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
        partyName: details.partyName,
        description: details.description,
        projectId: details.projectId,
        supplierId: details.supplierId,
        employeeId: details.employeeId,
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

  const canShowTopNext = step < totalSteps && (step > 1 || captureType);

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
                className="flex items-center justify-center w-10 h-10 -ml-1 text-ds-primary touch-manipulation shrink-0 rounded-xl"
                aria-label="Back"
              >
                <span className="w-5 h-5">{ICONS.chevronLeft}</span>
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
            {canShowTopNext && (
              <button
                type="button"
                onClick={goNext}
                className="text-xs font-bold text-white px-4 py-2 rounded-xl bg-ds-primary shadow-sm touch-manipulation"
              >
                Next →
              </button>
            )}
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

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-36">
        {step !== 1 && (
          <div className="mb-4">
            <h2 className="text-base font-semibold text-app-text">{currentStepMeta.title}</h2>
            <p className="text-sm text-app-muted">{currentStepMeta.subtitle}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-bold text-app-text">Select Transaction Type</h2>
              <p className="text-xs text-app-muted">Tap a type to continue — or create your own</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {allTypes.map((t) => {
                const selected = captureType.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectCaptureType(t)}
                    className={`qc-type-tile touch-manipulation ${selected ? 'qc-type-tile--out-selected' : ''}`}
                  >
                    <span className={`qc-type-tile-icon ${selected ? 'qc-type-tile-icon--selected' : ''}`}>
                      <span className="w-5 h-5">{captureTypeIcon(t)}</span>
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
                className="qc-type-tile qc-type-tile--create touch-manipulation col-span-2"
              >
                <span className="qc-type-tile-icon">
                  <span className="w-5 h-5">{ICONS.plus}</span>
                </span>
                <span className="text-[11px] font-semibold leading-tight text-center mt-1.5">
                  Create New Transaction Type
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
                <span className="w-4 h-4">{captureTypeIcon(captureType)}</span>
              </span>
              <div>
                <span className="text-app-muted text-xs block">Type</span>
                <span className="font-semibold">{captureType.label}</span>
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
            <button
              type="button"
              onClick={goNext}
              className="w-full py-3 rounded-xl bg-ds-primary text-white font-semibold touch-manipulation"
            >
              Continue to details
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <QuickCaptureDetailsStep
              captureType={captureType}
              value={details}
              onChange={patchDetails}
              fieldSuggestions={fieldSuggestions}
            />
            <button
              type="button"
              onClick={goNext}
              className="w-full py-3 rounded-xl bg-ds-primary text-white font-semibold touch-manipulation"
            >
              Continue to receipt
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-xs text-app-muted rounded-lg bg-app-card border border-app-border px-3 py-2">
              Snap a receipt photo (optional). Finance can extract details during review.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed border-app-border bg-app-card touch-manipulation"
            >
              <span className="w-12 h-12 text-app-muted">{ICONS.camera}</span>
              <span className="text-sm font-medium">
                {attachment ? attachment.name : 'Tap to scan receipt or upload'}
              </span>
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={goNext}
                className="flex-1 py-3 rounded-xl border border-app-border font-semibold touch-manipulation"
              >
                Skip receipt
              </button>
              <button
                type="button"
                onClick={goNext}
                className="flex-1 py-3 rounded-xl bg-ds-primary text-white font-semibold touch-manipulation"
              >
                Continue
              </button>
            </div>
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
              <ReviewRow label="Type" value={captureType.label} />
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
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={createMutation.isPending}
              className="w-full py-3.5 rounded-xl bg-ds-primary text-white font-bold touch-manipulation disabled:opacity-60"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit for finance review'}
            </button>
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
        onClose={() => setShowCreateType(false)}
        onCreated={handleCreateCustomType}
      />
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