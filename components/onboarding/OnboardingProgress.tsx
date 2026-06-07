import React from 'react';
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from '../../shared/onboarding/onboardingSteps';

type Props = {
  currentStep: OnboardingStepId;
  completedSteps: OnboardingStepId[];
  progressPercent: number;
  compact?: boolean;
};

const OnboardingProgress: React.FC<Props> = ({
  currentStep,
  completedSteps,
  progressPercent,
  compact = false,
}) => {
  const steps = ONBOARDING_STEPS.filter((s) => s.id !== 'completion');

  if (compact) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Setup progress</span>
          <span className="font-semibold text-indigo-600">{progressPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Setup wizard</p>
        <p className="text-2xl font-bold text-slate-800">{progressPercent}%</p>
        <p className="text-sm text-slate-500">Complete these steps to go live</p>
      </div>
      <ol className="space-y-1 flex-1 overflow-y-auto pr-1">
        {steps.map((step, index) => {
          const done = completedSteps.includes(step.id);
          const active = step.id === currentStep;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active ? 'bg-indigo-50 border border-indigo-100' : ''
              }`}
            >
              <span
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${active ? 'text-indigo-900' : 'text-slate-700'}`}>
                  {step.shortTitle}
                  {step.optional && (
                    <span className="ml-1.5 text-[10px] uppercase text-slate-400 font-normal">Optional</span>
                  )}
                </p>
                {active && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{step.description}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default OnboardingProgress;
