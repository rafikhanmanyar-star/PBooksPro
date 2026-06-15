import React from 'react';
import { WIZARD_STEPS } from '../constants/quickTransactionWizard';

type Props = {
  currentStep: number;
};

export default function QuickCaptureStepper({ currentStep }: Props) {
  return (
    <div className="flex items-start justify-between gap-1 px-1" aria-label="Capture progress">
      {WIZARD_STEPS.map((s) => {
        const done = s.id < currentStep;
        const active = s.id === currentStep;
        return (
          <div key={s.key} className="flex-1 flex flex-col items-center min-w-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done
                  ? 'bg-ds-primary text-white'
                  : active
                    ? 'bg-ds-primary/15 text-ds-primary ring-2 ring-ds-primary/40'
                    : 'bg-app-border/50 text-app-muted'
              }`}
            >
              {done ? '✓' : s.id}
            </div>
            <span
              className={`text-[9px] font-semibold mt-1 truncate w-full text-center ${
                active ? 'text-ds-primary' : 'text-app-muted'
              }`}
            >
              {s.key === 'type' ? 'Type' : s.key === 'amount' ? 'Amount' : s.key === 'details' ? 'Details' : s.key === 'receipt' ? 'Receipt' : 'Review'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
