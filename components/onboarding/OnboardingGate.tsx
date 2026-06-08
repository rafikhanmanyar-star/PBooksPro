import React from 'react';
import { useOnboardingContext } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import OnboardingWizard from './OnboardingWizard';
import type { OnboardingStepId } from '../../shared/onboarding/onboardingSteps';

const OnboardingGate: React.FC = () => {
  const { tenant } = useAuth();
  const {
    state,
    loading,
    open,
    setOpen,
    completeStep,
    persist,
    skipAll,
    resumeLater,
    canAccessOnboarding,
    isComplete,
  } = useOnboardingContext();

  if (loading || !canAccessOnboarding || !state || isComplete || !open) return null;

  return (
    <OnboardingWizard
      state={state}
      tenantName={tenant?.name}
      onCompleteStep={completeStep}
      onSaveDraft={async (patch) => {
        const next = {
          ...state,
          currentStep: patch.currentStep ?? state.currentStep,
          stepData: patch.stepData ?? state.stepData,
          updatedAt: new Date().toISOString(),
        };
        await persist(next);
      }}
      onSkipAll={() => void skipAll()}
      onResumeLater={resumeLater}
      onClose={() => setOpen(false)}
    />
  );
};

export default OnboardingGate;
