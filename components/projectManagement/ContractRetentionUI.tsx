import React, { useMemo } from 'react';
import type { Contract, ContractRetentionReleaseMethod, ContractRetentionType } from '../../types';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { CURRENCY } from '../../constants';
import {
  buildContractRetentionSummary,
  calculateRetentionAmount,
} from '../../utils/contractRetention';

const RETENTION_TYPE_OPTIONS: { value: ContractRetentionType; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'FIXED_AMOUNT', label: 'Fixed Amount' },
];

const RELEASE_METHOD_OPTIONS: { value: ContractRetentionReleaseMethod; label: string }[] = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'ON_COMPLETION', label: 'On Completion' },
  { value: 'ON_HANDOVER', label: 'On Handover' },
  { value: 'DEFECT_LIABILITY_PERIOD', label: 'Defect Liability Period' },
];

export type ContractRetentionFormState = {
  retentionType: ContractRetentionType;
  retentionPercentage: string;
  retentionFixedAmount: string;
  retentionReleaseMethod: ContractRetentionReleaseMethod | '';
  retentionReleaseDate: string;
  retentionNotes: string;
};

export function retentionStateFromContract(contract?: Contract | null): ContractRetentionFormState {
  return {
    retentionType: contract?.retentionType ?? 'NONE',
    retentionPercentage:
      contract?.retentionPercentage != null ? String(contract.retentionPercentage) : '',
    retentionFixedAmount:
      contract?.retentionType === 'FIXED_AMOUNT' && contract.retentionAmount != null
        ? String(contract.retentionAmount)
        : '',
    retentionReleaseMethod: contract?.retentionReleaseMethod ?? '',
    retentionReleaseDate: contract?.retentionReleaseDate ?? '',
    retentionNotes: contract?.retentionNotes ?? '',
  };
}

export function retentionPayloadFromState(
  state: ContractRetentionFormState,
  contractValue: number
): Pick<
  Contract,
  | 'retentionType'
  | 'retentionPercentage'
  | 'retentionAmount'
  | 'retentionReleaseMethod'
  | 'retentionReleaseDate'
  | 'retentionNotes'
> {
  const pct = parseFloat(state.retentionPercentage);
  const fixed = parseFloat(state.retentionFixedAmount);
  const computed =
    state.retentionType === 'PERCENTAGE'
      ? calculateRetentionAmount(contractValue, {
          retentionType: 'PERCENTAGE',
          retentionPercentage: Number.isFinite(pct) ? pct : 0,
        })
      : state.retentionType === 'FIXED_AMOUNT' && Number.isFinite(fixed)
        ? fixed
        : undefined;

  return {
    retentionType: state.retentionType,
    retentionPercentage:
      state.retentionType === 'PERCENTAGE' && Number.isFinite(pct) ? pct : undefined,
    retentionAmount: computed,
    retentionReleaseMethod: state.retentionReleaseMethod || undefined,
    retentionReleaseDate: state.retentionReleaseDate || undefined,
    retentionNotes: state.retentionNotes.trim() || undefined,
  };
}

interface ContractRetentionControlsProps {
  contractValue: number;
  state: ContractRetentionFormState;
  onChange: (patch: Partial<ContractRetentionFormState>) => void;
  readOnly?: boolean;
}

export const ContractRetentionControls: React.FC<ContractRetentionControlsProps> = ({
  contractValue,
  state,
  onChange,
  readOnly = false,
}) => {
  const preview = useMemo(() => {
    const payload = retentionPayloadFromState(state, contractValue);
    return buildContractRetentionSummary(
      {
        totalAmount: contractValue,
        retentionType: payload.retentionType,
        retentionPercentage: payload.retentionPercentage,
        retentionAmount: payload.retentionAmount,
      } as Contract,
      0
    );
  }, [state, contractValue]);

  return (
    <div className="border border-app-border rounded-lg p-4 bg-app-toolbar space-y-4">
      <h3 className="font-semibold text-app-text">Contract Financial Controls</h3>

      <Select
        label="Retention Type"
        value={state.retentionType}
        disabled={readOnly}
        onChange={(e) =>
          onChange({ retentionType: e.target.value as ContractRetentionType })
        }
      >
        {RETENTION_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      {state.retentionType === 'PERCENTAGE' && (
        <Input
          label="Retention %"
          type="number"
          min="0"
          max="100"
          step="0.01"
          disabled={readOnly}
          value={state.retentionPercentage}
          onChange={(e) => onChange({ retentionPercentage: e.target.value })}
        />
      )}

      {state.retentionType === 'FIXED_AMOUNT' && (
        <Input
          label="Retention Amount"
          type="number"
          min="0"
          step="0.01"
          disabled={readOnly}
          value={state.retentionFixedAmount}
          onChange={(e) => onChange({ retentionFixedAmount: e.target.value })}
        />
      )}

      {state.retentionType !== 'NONE' && (
        <>
          <Select
            label="Retention Release Method"
            value={state.retentionReleaseMethod}
            disabled={readOnly}
            onChange={(e) =>
              onChange({
                retentionReleaseMethod: e.target.value as ContractRetentionReleaseMethod,
              })
            }
          >
            <option value="">— Select —</option>
            {RELEASE_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input
            label="Planned Release Date"
            type="date"
            disabled={readOnly}
            value={state.retentionReleaseDate}
            onChange={(e) => onChange({ retentionReleaseDate: e.target.value })}
          />
          <Textarea
            label="Retention Notes"
            rows={2}
            disabled={readOnly}
            value={state.retentionNotes}
            onChange={(e) => onChange({ retentionNotes: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-app-card border border-app-border text-sm">
            <div>
              <span className="text-app-muted block text-xs uppercase">Contract Value</span>
              <span className="font-semibold text-app-text tabular-nums">
                {CURRENCY} {contractValue.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-app-muted block text-xs uppercase">Retention Amount</span>
              <span className="font-semibold text-app-text tabular-nums">
                {CURRENCY} {preview.retentionAmount.toLocaleString()}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-app-muted block text-xs uppercase">
                Maximum Payable Before Retention Release
              </span>
              <span className="font-bold text-lg text-ds-success tabular-nums">
                {CURRENCY} {preview.maximumPayable.toLocaleString()}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface ContractRetentionSummaryPanelProps {
  contract: Contract;
  paidAmount: number;
  compact?: boolean;
}

export const ContractRetentionSummaryPanel: React.FC<ContractRetentionSummaryPanelProps> = ({
  contract,
  paidAmount,
  compact = false,
}) => {
  const summary = useMemo(
    () => buildContractRetentionSummary(contract, paidAmount),
    [contract, paidAmount]
  );

  if ((contract.retentionType ?? 'NONE') === 'NONE') {
    return (
      <div className={`${compact ? 'text-sm' : ''} text-app-muted italic`}>
        No retention configured on this contract.
      </div>
    );
  }

  const alertClass =
    summary.alertLevel === 'critical'
      ? 'border-ds-danger/40 bg-ds-danger/10 text-ds-danger'
      : summary.alertLevel === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-app-border bg-app-card text-app-text';

  const items = [
    { label: 'Contract Value', value: summary.contractValue },
    { label: 'Retention Amount', value: summary.retentionAmount },
    { label: 'Paid Amount', value: summary.paidAmount },
    { label: 'Outstanding Amount', value: summary.outstandingAmount },
    { label: 'Retention Held', value: summary.retentionHeld },
    { label: 'Maximum Payable Before Retention Release', value: summary.maximumPayable },
    { label: 'Remaining Payable Balance', value: summary.remainingPayable },
  ];

  return (
    <div className="space-y-3">
      {summary.alertLevel !== 'none' && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${alertClass}`}>
          <p className="font-semibold">
            {summary.alertLevel === 'critical'
              ? '🚨 Retention Threshold Reached'
              : '⚠ Contract nearing retention limit'}
          </p>
          <p className="mt-1 whitespace-pre-line text-xs opacity-90">
            Paid: {CURRENCY} {summary.paidAmount.toLocaleString()} · Remaining before retention:{' '}
            {CURRENCY} {summary.remainingPayable.toLocaleString()}
          </p>
        </div>
      )}

      <div
        className={`grid gap-3 ${
          compact ? 'grid-cols-2 text-sm' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-app-border bg-app-toolbar px-3 py-2"
          >
            <span className="text-xs text-app-muted uppercase block">{item.label}</span>
            <span className="font-semibold tabular-nums text-app-text">
              {CURRENCY} {item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function retentionStatusBadge(contract: Contract, paidAmount: number): {
  label: string;
  className: string;
} | null {
  const summary = buildContractRetentionSummary(contract, paidAmount);
  if (summary.alertLevel === 'critical') {
    return {
      label: 'Retention Limit',
      className: 'bg-ds-danger/15 text-ds-danger border border-ds-danger/30',
    };
  }
  if (summary.alertLevel === 'warning') {
    return {
      label: 'Near Limit',
      className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    };
  }
  if ((contract.retentionType ?? 'NONE') !== 'NONE') {
    return {
      label: 'Retention',
      className: 'bg-primary/10 text-primary border border-primary/20',
    };
  }
  return null;
}
