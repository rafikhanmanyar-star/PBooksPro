import React, { useRef, useState } from 'react';
import Select from '../../../components/ui/Select';
import Input from '../../../components/ui/Input';
import { UNPOSTED_TRANSACTION_TYPES } from '../../../types/executiveMobile.types';
import { useCreateUnpostedTransaction } from '../hooks/useUnpostedTransactions';
import { uploadUnpostedAttachment } from '../../../services/api/unpostedTransactionsApi';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { ICONS } from '../../../constants';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';

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

export default function QuickTransactionPage() {
  const { setView } = useExecutiveMode();
  const createMutation = useCreateUnpostedTransaction();
  const fileRef = useRef<HTMLInputElement>(null);

  const [transactionType, setTransactionType] = useState(UNPOSTED_TRANSACTION_TYPES[0].id);
  const [amount, setAmount] = useState('');
  const [partyName, setPartyName] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Enter a valid amount');
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
          Your finance team will process this transaction. No accounting entries were created yet.
        </p>
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold touch-manipulation"
          onClick={() => {
            setSubmitted(false);
            setAmount('');
            setPartyName('');
            setDescription('');
            setAttachment(null);
          }}
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
    <div className="p-4 pb-24">
      <h1 className="text-lg font-bold mb-1">Quick Transaction</h1>
      <p className="text-xs text-app-muted mb-4">Record field expenses in under 30 seconds.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Transaction type"
          value={transactionType}
          onChange={(e) => setTransactionType(e.target.value)}
        >
          {UNPOSTED_TRANSACTION_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>

        <Input
          label="Amount (PKR)"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="text-lg"
        />

        <Input
          label="Party (supplier, worker, customer…)"
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
          placeholder="Who was paid or who paid you?"
        />

        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief note"
        />

        <div>
          <label className="block text-sm font-medium text-app-text mb-2">Receipt photo</label>
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
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-app-border bg-app-card touch-manipulation"
          >
            {ICONS.camera}
            <span>{attachment ? attachment.name : 'Capture or upload receipt'}</span>
          </button>
        </div>

        {error && <p className="text-sm text-ds-danger">{error}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg touch-manipulation disabled:opacity-60"
        >
          {createMutation.isPending ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    </div>
  );
}
