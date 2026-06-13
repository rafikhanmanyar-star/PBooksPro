import React, { useMemo, useState } from 'react';
import type { Contract } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Input from '../ui/Input';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import { buildContractRetentionSummary } from '../../utils/contractRetention';
import { apiClient } from '../../services/api/client';
import { normalizeContractFromApi } from '../../services/api/repositories/contractsApi';

interface ContractRetentionReleaseModalProps {
  contract: Contract;
  paidAmount: number;
  isOpen: boolean;
  onClose: () => void;
}

const ContractRetentionReleaseModal: React.FC<ContractRetentionReleaseModalProps> = ({
  contract,
  paidAmount,
  isOpen,
  onClose,
}) => {
  const dispatch = useDispatchOnly();
  const { showToast, showAlert } = useNotification();
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const summary = useMemo(
    () => buildContractRetentionSummary(contract, paidAmount),
    [contract, paidAmount]
  );

  const available = summary.remainingRetention;

  const handleSubmit = async () => {
    if (available <= 0) {
      await showAlert('No retention balance available to release.');
      return;
    }
    setIsSubmitting(true);
    try {
      const body =
        mode === 'full'
          ? { fullRelease: true, releaseDate }
          : { amount: parseFloat(amount), releaseDate };

      if (mode === 'partial') {
        const n = parseFloat(amount);
        if (!Number.isFinite(n) || n <= 0) {
          await showAlert('Enter a valid release amount.');
          return;
        }
        if (n > available + 0.01) {
          await showAlert(`Amount cannot exceed available retention (${CURRENCY} ${available.toLocaleString()}).`);
          return;
        }
      }

      const raw = await apiClient.post<Record<string, unknown>>(
        `/contracts/${contract.id}/release-retention`,
        body
      );
      const updated = normalizeContractFromApi(raw);
      dispatch({ type: 'UPDATE_CONTRACT', payload: updated });
      showToast('Retention released successfully.');
      onClose();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to release retention');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Release Retention" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-app-muted block text-xs">Contract Value</span>
            <span className="font-semibold tabular-nums">
              {CURRENCY} {summary.contractValue.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-app-muted block text-xs">Retention Held</span>
            <span className="font-semibold tabular-nums">
              {CURRENCY} {summary.retentionHeld.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-app-muted block text-xs">Already Released</span>
            <span className="font-semibold tabular-nums">
              {CURRENCY} {summary.retentionReleased.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-app-muted block text-xs">Balance Available</span>
            <span className="font-bold text-ds-success tabular-nums">
              {CURRENCY} {available.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === 'full' ? 'primary' : 'secondary'}
            onClick={() => setMode('full')}
          >
            Full Release
          </Button>
          <Button
            type="button"
            variant={mode === 'partial' ? 'primary' : 'secondary'}
            onClick={() => setMode('partial')}
          >
            Partial Release
          </Button>
        </div>

        {mode === 'partial' && (
          <Input
            label="Release Amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}

        <Input
          label="Release Date"
          type="date"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton type="button" loading={isSubmitting} onClick={handleSubmit}>
            Release Retention
          </LoadingButton>
        </div>
      </div>
    </Modal>
  );
};

export default ContractRetentionReleaseModal;
