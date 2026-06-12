import React, { useMemo, useRef, useState } from 'react';
import Input from '../../../components/ui/Input';
import { UNPOSTED_TRANSACTION_TYPES } from '../../../types/executiveMobile.types';
import { useCreateUnpostedTransaction } from '../hooks/useUnpostedTransactions';
import { uploadUnpostedAttachment } from '../../../services/api/unpostedTransactionsApi';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { CURRENCY, ICONS } from '../../../constants';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';
import {
  isInflowType,
  OUTFLOW_TYPE_IDS,
  partyPlaceholder,
  QUICK_AMOUNT_PRESETS,
  transactionTypeIcon,
  transactionTypeLabel,
  WIZARD_STEPS,
} from '../constants/quickTransactionWizard';

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
  const createMutation = useCreateUnpostedTransaction();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [transactionType, setTransactionType] = useState(UNPOSTED_TRANSACTION_TYPES[0].id);
  const [amount, setAmount] = useState('');
  const [partyName, setPartyName] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStepMeta = WIZARD_STEPS[step - 1];
  const totalSteps = WIZARD_STEPS.length;

  const outflowTypes = useMemo(
    () => UNPOSTED_TRANSACTION_TYPES.filter((t) => OUTFLOW_TYPE_IDS.has(t.id)),
    []
  );
  const inflowTypes = useMemo(
    () => UNPOSTED_TRANSACTION_TYPES.filter((t) => t.id === 'customer_collection'),
    []
  );

  const resetWizard = () => {
    setStep(1);
    setTransactionType(UNPOSTED_TRANSACTION_TYPES[0].id);
    setAmount('');
    setPartyName('');
    setDescription('');
    setAttachment(null);
    setSubmitted(false);
    setError(null);
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
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
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
      const created = await createMutation.mutateAsync({
        transactionDate: todayLocalYyyyMmDd(),
        amount: parsedAmount,
        transactionType,
        partyName: partyName.trim() || undefined,
        description: description.trim() || undefined,
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
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  if (submitted) {
    return (
      <div className="p-6 pb-24 text-center space-y-4">
        <div className="w-16 h-16 mx-auto text-green-600">{ICONS.checkCircle}</div>
        <h2 className="text-lg font-bold">Submitted for review</h2>
        <p className="text-sm text-app-muted">
          Finance will process this transaction. You will get bell alerts as it moves through review.
        </p>
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold touch-manipulation"
          onClick={resetWizard}
        >
          Record another
        </button>
        <button
          type="button"
          className="w-full py-3 text-green-600 touch-manipulation"
          onClick={() => setView('myTransactions')}
        >
          View my submissions
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-9rem)]">
      <div className="px-4 pt-4 pb-3 border-b border-app-border bg-app-header shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">Quick Transaction</h1>
            <p className="text-xs text-app-muted">Step {step} of {totalSteps}</p>
          </div>
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-green-600 px-2 py-1 touch-manipulation shrink-0"
            >
              <span className="w-5 h-5">{ICONS.chevronLeft}</span>
              Back
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {WIZARD_STEPS.map((s) => (
            <div
              key={s.key}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s.id < step ? 'bg-green-600' : s.id === step ? 'bg-green-400' : 'bg-app-border'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-app-text">{currentStepMeta.title}</h2>
          <p className="text-sm text-app-muted">{currentStepMeta.subtitle}</p>
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-app-muted mb-2">Money out</p>
              <div className="grid grid-cols-2 gap-2">
                {outflowTypes.map((t) => {
                  const selected = transactionType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTransactionType(t.id)}
                      className={`p-3 rounded-xl border text-left touch-manipulation transition-colors ${
                        selected
                          ? 'border-green-600 bg-green-50 dark:bg-green-950/30 ring-2 ring-green-600/30'
                          : 'border-app-border bg-app-card hover:border-green-400/50'
                      }`}
                    >
                      <span className={`inline-flex w-8 h-8 items-center justify-center rounded-lg mb-2 ${
                        selected ? 'bg-green-600 text-white' : 'bg-black/5 dark:bg-white/10 text-app-muted'
                      }`}>
                        <span className="w-5 h-5">{transactionTypeIcon(t.id)}</span>
                      </span>
                      <p className="text-sm font-medium leading-snug">{t.label}</p>
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-app-muted mb-2">Money in</p>
              <div className="grid grid-cols-1 gap-2">
                {inflowTypes.map((t) => {
                  const selected = transactionType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTransactionType(t.id)}
                      className={`p-3 rounded-xl border text-left touch-manipulation flex items-center gap-3 ${
                        selected
                          ? 'border-green-600 bg-green-50 dark:bg-green-950/30 ring-2 ring-green-600/30'
                          : 'border-app-border bg-app-card'
                      }`}
                    >
                      <span className={`inline-flex w-10 h-10 items-center justify-center rounded-lg shrink-0 ${
                        selected ? 'bg-green-600 text-white' : 'bg-black/5 dark:bg-white/10 text-app-muted'
                      }`}>
                        <span className="w-5 h-5">{transactionTypeIcon(t.id)}</span>
                      </span>
                      <p className="text-sm font-medium">{t.label}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-app-card border border-app-border text-sm">
              <span className="text-app-muted">Type: </span>
              <span className="font-medium">{transactionTypeLabel(transactionType)}</span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                isInflowType(transactionType)
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
              }`}>
                {isInflowType(transactionType) ? 'Collection' : 'Payment'}
              </span>
            </div>
            <Input
              label={`Amount (${CURRENCY})`}
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-2xl font-bold text-center"
              autoFocus
            />
            <div>
              <p className="text-xs text-app-muted mb-2">Quick amounts</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className={`px-3 py-2 rounded-lg text-sm border touch-manipulation ${
                      amount === String(preset)
                        ? 'border-green-600 bg-green-50 text-green-800 dark:bg-green-950/30'
                        : 'border-app-border bg-app-card'
                    }`}
                  >
                    {(preset / 1000).toLocaleString()}k
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Input
              label={partyPlaceholder(transactionType)}
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder={partyPlaceholder(transactionType)}
              autoFocus
            />
            <Input
              label="Note (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cement delivery, site visit fuel…"
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
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
                {attachment ? attachment.name : 'Tap to capture or upload receipt'}
              </span>
              <span className="text-xs text-app-muted">Photo or PDF</span>
            </button>
            {attachment && (
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-sm text-ds-danger touch-manipulation"
              >
                Remove attachment
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-app-border bg-app-card divide-y divide-app-border">
              <ReviewRow label="Type" value={transactionTypeLabel(transactionType)} />
              <ReviewRow label="Amount" value={formatAmount(amount)} highlight />
              <ReviewRow label="Party" value={partyName.trim() || '—'} />
              <ReviewRow label="Note" value={description.trim() || '—'} />
              <ReviewRow label="Receipt" value={attachment ? attachment.name : 'None'} />
              <ReviewRow label="Date" value={todayLocalYyyyMmDd()} />
            </div>
            <p className="text-xs text-app-muted px-1">
              Submitting sends this to your finance team. No accounting entries are created until they process it.
            </p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-ds-danger">{error}</p>}
      </div>

      <div className="sticky bottom-0 mt-auto shrink-0 px-4 py-3 border-t border-app-border bg-app-bg/95 backdrop-blur-sm pb-safe">
        {step < totalSteps ? (
          <button
            type="button"
            onClick={goNext}
            className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg touch-manipulation flex items-center justify-center gap-2"
          >
            Continue
            <span className="w-5 h-5">{ICONS.chevronRight}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={createMutation.isPending}
            className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg touch-manipulation disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {createMutation.isPending ? 'Submitting…' : (
              <>
                Submit for review
                <span className="w-5 h-5">{ICONS.send}</span>
              </>
            )}
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            onClick={goNext}
            className="w-full mt-2 py-2 text-sm text-app-muted touch-manipulation"
          >
            Skip receipt →
          </button>
        )}
      </div>
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
