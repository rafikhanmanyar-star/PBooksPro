import React, { useEffect, useMemo, useRef, useState } from 'react';
import Input from '../../../components/ui/Input';
import AmountInput from '../../../components/common/AmountInput';
import { UNPOSTED_TRANSACTION_TYPES } from '../../../types/executiveMobile.types';
import { useCreateUnpostedTransaction } from '../hooks/useUnpostedTransactions';
import { uploadUnpostedAttachment } from '../../../services/api/unpostedTransactionsApi';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useAuth } from '../../../context/AuthContext';
import { CURRENCY, ICONS } from '../../../constants';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';
import FieldSuggestionChips from './FieldSuggestionChips';
import QuickCaptureStepper from './QuickCaptureStepper';
import RecentCapturesList from './RecentCapturesList';
import VoiceCapturePanel from './VoiceCapturePanel';
import {
  getLastQuickCaptureSnapshot,
  getQuickCaptureSuggestions,
  saveQuickCaptureFields,
} from '../utils/quickCaptureFieldHistory';
import {
  isInflowType,
  OUTFLOW_TYPE_IDS,
  partyPlaceholder,
  QUICK_AMOUNT_PRESETS,
  transactionTypeIcon,
  transactionTypeLabel,
  typeShortLabel,
  WIZARD_STEPS,
} from '../constants/quickTransactionWizard';
import { UNPOSTED_SOURCE_EXECUTIVE_APP } from '../../../types/executiveMobile.types';
import type { ParsedVoiceCapture } from '../utils/parseVoiceQuickCapture';
import { voiceDescriptionForFinance } from '../utils/parseVoiceQuickCapture';

type MoneyFilter = 'out' | 'in';

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

export default function QuickTransactionWizard() {
  const { setView } = useExecutiveMode();
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const createMutation = useCreateUnpostedTransaction();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [moneyFilter, setMoneyFilter] = useState<MoneyFilter>('out');
  const [transactionType, setTransactionType] = useState(UNPOSTED_TRANSACTION_TYPES[0].id);
  const [amount, setAmount] = useState('');
  const [partyName, setPartyName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [costCenterCode, setCostCenterCode] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldSuggestions, setFieldSuggestions] = useState(() =>
    getQuickCaptureSuggestions(UNPOSTED_TRANSACTION_TYPES[0].id, tenantId)
  );
  const [lastSnapshot, setLastSnapshot] = useState(() => getLastQuickCaptureSnapshot(tenantId));

  const currentStepMeta = WIZARD_STEPS[step - 1];
  const totalSteps = WIZARD_STEPS.length;

  const outflowTypes = useMemo(
    () => UNPOSTED_TRANSACTION_TYPES.filter((t) => OUTFLOW_TYPE_IDS.has(t.id)),
    []
  );
  const inflowTypes = useMemo(
    () => UNPOSTED_TRANSACTION_TYPES.filter((t) => isInflowType(t.id)),
    []
  );
  const visibleTypes = moneyFilter === 'in' ? inflowTypes : outflowTypes;

  const persistDetailFields = () => {
    saveQuickCaptureFields(
      transactionType,
      { partyName, description, projectId, costCenterCode },
      tenantId
    );
    setFieldSuggestions(getQuickCaptureSuggestions(transactionType, tenantId));
    setLastSnapshot(getLastQuickCaptureSnapshot(tenantId));
  };

  const applyLastSnapshot = () => {
    const snap = getLastQuickCaptureSnapshot(tenantId);
    if (!snap) return;
    if (snap.partyName) setPartyName(snap.partyName);
    if (snap.description) setDescription(snap.description);
    if (snap.projectId) setProjectId(snap.projectId);
    if (snap.costCenterCode) setCostCenterCode(snap.costCenterCode);
  };

  const lastSnapshotSummary = useMemo(() => {
    if (!lastSnapshot) return '';
    return [lastSnapshot.partyName, lastSnapshot.description, lastSnapshot.projectId, lastSnapshot.costCenterCode]
      .filter(Boolean)
      .join(' · ');
  }, [lastSnapshot]);

  useEffect(() => {
    if (step !== 3) return;
    setFieldSuggestions(getQuickCaptureSuggestions(transactionType, tenantId));
    setLastSnapshot(getLastQuickCaptureSnapshot(tenantId));
  }, [step, transactionType, tenantId]);

  const resetWizard = () => {
    setStep(1);
    setMoneyFilter('out');
    setTransactionType(UNPOSTED_TRANSACTION_TYPES[0].id);
    setAmount('');
    setPartyName('');
    setDescription('');
    setProjectId('');
    setCostCenterCode('');
    setAttachment(null);
    setVoiceTranscript(null);
    setSubmitted(false);
    setError(null);
  };

  const applyVoiceParsed = (parsed: ParsedVoiceCapture) => {
    setError(null);
    setVoiceTranscript(parsed.rawTranscript);
    setTransactionType(parsed.transactionType);
    setAmount(String(parsed.amount));
    if (parsed.partyName) setPartyName(parsed.partyName);
    if (parsed.projectId) setProjectId(parsed.projectId);
    if (parsed.costCenterCode) setCostCenterCode(parsed.costCenterCode);
    setMoneyFilter(isInflowType(parsed.transactionType) ? 'in' : 'out');
    setStep(parsed.confidence === 'high' ? 5 : 3);
  };

  const validateStep = (): boolean => {
    setError(null);
    if (step === 1 && !transactionType) {
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

  const selectTransactionType = (typeId: (typeof UNPOSTED_TRANSACTION_TYPES)[number]['id']) => {
    setError(null);
    setVoiceTranscript(null);
    setTransactionType(typeId);
    setMoneyFilter(isInflowType(typeId) ? 'in' : 'out');
  };

  const selectQuickAmount = (preset: number) => {
    setError(null);
    setAmount(String(preset));
    if (!transactionType) {
      setError('Select a transaction type first');
      return;
    }
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
    const financeDescription = voiceTranscript
      ? voiceDescriptionForFinance(voiceTranscript, description.trim() || undefined)
      : description.trim() || undefined;

    try {
      const created = await createMutation.mutateAsync({
        transactionDate: todayLocalYyyyMmDd(),
        amount: parsedAmount,
        transactionType,
        partyName: partyName.trim() || undefined,
        description: financeDescription,
        projectId: projectId.trim() || undefined,
        costCenterCode: costCenterCode.trim() || undefined,
        source: UNPOSTED_SOURCE_EXECUTIVE_APP,
        status: 'submitted',
      });
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
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-app-border/60 bg-app-card/95 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
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
          <button
            type="button"
            onClick={() => setView('myTransactions')}
            className="shrink-0 text-xs font-semibold text-ds-primary px-3 py-2 rounded-xl border border-ds-primary/30 bg-ds-primary/5 touch-manipulation"
          >
            My Submissions
          </button>
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

        {/* Step 1 — Type hub (reference layout) */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-app-text">Select Transaction Type</h2>
                <p className="text-xs text-app-muted">Choose what you want to record</p>
              </div>
              <button
                type="button"
                onClick={() => setMoneyFilter((f) => (f === 'out' ? 'in' : 'out'))}
                className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border touch-manipulation ${
                  moneyFilter === 'in'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                }`}
              >
                {moneyFilter === 'in' ? '↑ Money In' : '↓ Money Out'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {visibleTypes.map((t) => {
                const selected = transactionType === t.id;
                const isOut = OUTFLOW_TYPE_IDS.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTransactionType(t.id)}
                    className={`qc-type-tile touch-manipulation ${
                      selected
                        ? isOut
                          ? 'qc-type-tile--out-selected'
                          : 'qc-type-tile--in-selected'
                        : ''
                    }`}
                  >
                    <span className={`qc-type-tile-icon ${selected ? 'qc-type-tile-icon--selected' : ''}`}>
                      <span className="w-5 h-5">{transactionTypeIcon(t.id)}</span>
                    </span>
                    <span className="text-[10px] font-medium leading-tight text-center mt-1.5 line-clamp-2">
                      {typeShortLabel(t.id)}
                    </span>
                  </button>
                );
              })}
            </div>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-app-text">Quick Amounts (PKR)</h3>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-semibold text-ds-primary touch-manipulation"
                >
                  Enter Custom Amount
                </button>
              </div>
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
            </section>

            <RecentCapturesList limit={4} />

            {transactionType && amount && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full py-3 rounded-xl bg-ds-primary text-white font-semibold text-sm touch-manipulation"
              >
                Continue to details
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-app-card border border-app-border text-sm">
              <span className="text-app-muted">Type: </span>
              <span className="font-medium">{transactionTypeLabel(transactionType)}</span>
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
              Continue
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {lastSnapshotSummary && (
              <button
                type="button"
                onClick={applyLastSnapshot}
                className="w-full text-left p-3 rounded-xl border border-ds-primary/30 bg-ds-primary/5 touch-manipulation"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ds-primary mb-1">
                  Use last capture
                </p>
                <p className="text-sm text-app-text line-clamp-2">{lastSnapshotSummary}</p>
              </button>
            )}
            <div>
              <Input
                label={partyPlaceholder(transactionType)}
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder={partyPlaceholder(transactionType)}
                autoFocus
              />
              <FieldSuggestionChips
                suggestions={fieldSuggestions.partyName}
                currentValue={partyName}
                onSelect={setPartyName}
              />
            </div>
            <div>
              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Cement delivery, site visit fuel…"
              />
              <FieldSuggestionChips
                suggestions={fieldSuggestions.description}
                currentValue={description}
                onSelect={setDescription}
              />
            </div>
            <div>
              <Input
                label="Project (optional)"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Project name or ID"
              />
              <FieldSuggestionChips
                suggestions={fieldSuggestions.projectId}
                currentValue={projectId}
                onSelect={setProjectId}
              />
            </div>
            <div>
              <Input
                label="Cost Center (optional)"
                value={costCenterCode}
                onChange={(e) => setCostCenterCode(e.target.value)}
                placeholder="e.g. SITE-01"
              />
              <FieldSuggestionChips
                suggestions={fieldSuggestions.costCenterCode}
                currentValue={costCenterCode}
                onSelect={setCostCenterCode}
              />
            </div>
            <button
              type="button"
              onClick={goNext}
              className="w-full py-3 rounded-xl bg-ds-primary text-white font-semibold touch-manipulation"
            >
              Continue
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
              <ReviewRow label="Type" value={transactionTypeLabel(transactionType)} />
              <ReviewRow label="Amount" value={formatAmount(amount)} highlight />
              <ReviewRow label="Party" value={partyName.trim() || '—'} />
              <ReviewRow label="Notes" value={description.trim() || '—'} />
              <ReviewRow label="Project" value={projectId.trim() || '—'} />
              <ReviewRow label="Cost Center" value={costCenterCode.trim() || '—'} />
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

      {/* Voice panel — pinned above bottom nav on step 1 */}
      {step === 1 && (
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-app-border/40 bg-app-bg/95 backdrop-blur-sm">
          <VoiceCapturePanel
            disabled={createMutation.isPending}
            onParsed={applyVoiceParsed}
            onError={(msg) => setError(msg)}
          />
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
