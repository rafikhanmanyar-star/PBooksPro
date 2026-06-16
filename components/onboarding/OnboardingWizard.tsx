import React, { useCallback, useMemo, useState } from 'react';
import Button from '../ui/Button';
import OnboardingProgress from './OnboardingProgress';
import {
  getOnboardingFlow,
  getStepsForFlow,
  prevOnboardingStep,
  type OnboardingStepId,
} from '../../shared/onboarding/onboardingSteps';
import type { OnboardingState } from '../../services/api/onboardingApi';
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import {
  applyOnboardingStepActions,
  BusinessSetupStepPanel,
  ChartOfAccountsStepPanel,
  CompanyInfoStepPanel,
  CompletionStepPanel,
  FirstTransactionStepPanel,
  FiscalYearStepPanel,
  PropertySetupStepPanel,
  resolveCompanyInfoDefaults,
  UserSetupStepPanel,
  WelcomeStepPanel,
} from './OnboardingStepPanels';
import { usePrintSettings } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';

type Props = {
  state: OnboardingState;
  onCompleteStep: (stepId: OnboardingStepId, stepData?: Record<string, unknown>) => Promise<OnboardingState | undefined>;
  onSaveDraft: (patch: { currentStep?: OnboardingStepId; stepData?: Record<string, unknown> }) => Promise<void>;
  onSkipAll: () => void;
  onResumeLater: () => void;
  onClose: () => void;
  tenantName?: string;
};

const OnboardingWizard: React.FC<Props> = ({
  state,
  onCompleteStep,
  onSaveDraft,
  onSkipAll,
  onResumeLater,
  onClose,
  tenantName,
}) => {
  const dispatch = useDispatchOnly();
  const { isAuthenticated, tenant, user } = useAuth();
  const printSettings = usePrintSettings();
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<Record<string, unknown>>(state.stepData);

  const flow = useMemo(() => getOnboardingFlow(state.stepData), [state.stepData]);

  const stepMeta = useMemo(() => {
    const steps = getStepsForFlow(flow);
    return steps.find((s) => s.id === state.currentStep) ?? steps[0];
  }, [state.currentStep, flow]);

  const mergeStepData = useCallback(
    (stepId: OnboardingStepId, partial: Record<string, unknown>) => {
      setDraftData((prev) => ({
        ...prev,
        [stepId]: { ...(prev[stepId] as Record<string, unknown> | undefined), ...partial },
      }));
    },
    []
  );

  const effectiveState = useMemo(
    () => ({ ...state, stepData: draftData }),
    [state, draftData]
  );

  const handleContinue = async () => {
    setStepError(null);
    setBusy(true);
    try {
      const stepId = state.currentStep;
      let stepPayload = draftData[stepId] as Record<string, unknown> | undefined;

      if (stepId === 'company_info') {
        const saved = (stepPayload ?? {}) as Partial<{ companyName?: string }>;
        const resolved = resolveCompanyInfoDefaults(saved, printSettings, tenant, user?.email);
        if (!resolved.companyName?.trim()) {
          setStepError('Company name is required.');
          return;
        }
        stepPayload = resolved as Record<string, unknown>;
        mergeStepData(stepId, resolved);
      }
      if (stepId === 'property_setup') {
        const ps = stepPayload as Record<string, string> | undefined;
        const { _getAppState } = await import('../../context/appStateStore');
        const hasProperties = _getAppState().properties.length > 0;
        if (!hasProperties && (!ps?.buildingName?.trim() || !ps?.propertyName?.trim() || !ps?.ownerName?.trim())) {
          setStepError('Enter owner, building, and property names to continue.');
          return;
        }
      }

      const stepDataForActions = stepPayload
        ? { ...draftData, [stepId]: stepPayload }
        : draftData;

      await applyOnboardingStepActions(stepId, { ...effectiveState, stepData: stepDataForActions }, {
        dispatch,
        isAuthenticated,
      });

      await onCompleteStep(stepId, stepPayload);
      if (stepId === 'completion') onClose();
    } catch (err: unknown) {
      setStepError(err instanceof Error ? err.message : 'Could not save this step.');
    } finally {
      setBusy(false);
    }
  };

  const handleBack = async () => {
    const prev = prevOnboardingStep(state.currentStep, flow);
    if (!prev) return;
    setStepError(null);
    await onSaveDraft({ currentStep: prev, stepData: draftData });
  };

  const handleSkipStep = async () => {
    setStepError(null);
    setBusy(true);
    try {
      await onCompleteStep(state.currentStep, {});
    } finally {
      setBusy(false);
    }
  };

  const renderStep = () => {
    const panelProps = {
      stepId: state.currentStep,
      state: effectiveState,
      onStepDataChange: (partial: Record<string, unknown>) => mergeStepData(state.currentStep, partial),
      setBusy,
      setStepError,
    };
    switch (state.currentStep) {
      case 'welcome':
        return <WelcomeStepPanel tenantName={tenantName} />;
      case 'business_setup':
        return <BusinessSetupStepPanel {...panelProps} />;
      case 'company_info':
        return <CompanyInfoStepPanel {...panelProps} />;
      case 'fiscal_year':
        return <FiscalYearStepPanel {...panelProps} />;
      case 'chart_of_accounts':
        return <ChartOfAccountsStepPanel />;
      case 'property_setup':
        return <PropertySetupStepPanel {...panelProps} />;
      case 'user_setup':
        return <UserSetupStepPanel {...panelProps} />;
      case 'first_transaction':
        return <FirstTransactionStepPanel {...panelProps} />;
      case 'completion':
        return <CompletionStepPanel state={effectiveState} tenantName={tenantName} />;
      default:
        return null;
    }
  };

  const isSkippable = stepMeta.skippable;
  const isLast = state.currentStep === 'completion';

  return (
    <div className="fixed inset-0 z-[10040] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-5xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col sm:flex-row bg-white sm:rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <aside className="hidden sm:flex sm:w-72 flex-shrink-0 bg-slate-50 border-r border-slate-200 p-6">
          <OnboardingProgress
            currentStep={state.currentStep}
            completedSteps={state.completedSteps}
            progressPercent={state.progressPercent}
            stepData={state.stepData}
          />
        </aside>

        <div className="flex-1 flex flex-col min-h-0">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-b border-slate-100">
            <div className="min-w-0 flex-1 sm:hidden">
              <OnboardingProgress
                currentStep={state.currentStep}
                completedSteps={state.completedSteps}
                progressPercent={state.progressPercent}
                stepData={state.stepData}
                compact
              />
            </div>
            <div className="hidden sm:block min-w-0">
              <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Step {state.completedSteps.length + 1}</p>
              <h1 id="onboarding-title" className="text-lg font-semibold text-slate-900 truncate">
                {stepMeta.title}
              </h1>
            </div>
            <button
              type="button"
              onClick={onResumeLater}
              className="text-sm text-slate-500 hover:text-slate-800 whitespace-nowrap"
            >
              Save & exit
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
            <div className="sm:hidden mb-4">
              <h1 className="text-xl font-bold text-slate-900">{stepMeta.title}</h1>
              <p className="text-sm text-slate-500 mt-1">{stepMeta.description}</p>
            </div>
            <div className="hidden sm:block mb-6">
              <p className="text-slate-600">{stepMeta.description}</p>
            </div>
            {stepError && (
              <p className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{stepError}</p>
            )}
            {renderStep()}
          </div>

          <footer className="flex flex-wrap items-center gap-3 px-4 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/80">
            {prevOnboardingStep(state.currentStep, flow) && (
              <Button variant="secondary" onClick={() => void handleBack()} disabled={busy}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            {isSkippable && !isLast && (
              <Button variant="secondary" onClick={() => void handleSkipStep()} disabled={busy}>
                Skip
              </Button>
            )}
            <button type="button" onClick={onSkipAll} className="text-sm text-slate-500 hover:text-slate-700 px-2">
              Skip entire setup
            </button>
            <Button onClick={() => void handleContinue()} disabled={busy}>
              {busy ? 'Saving…' : isLast ? 'Go to dashboard' : 'Continue'}
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
