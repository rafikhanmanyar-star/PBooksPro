import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompanyOptional } from '../context/CompanyContext';
import { isLocalOnlyMode } from '../config/apiUrl';
import { isDemoModeActive } from '../config/demoEnvironment';
import {
  onboardingApi,
  loadLocalOnboarding,
  saveLocalOnboarding,
  type OnboardingState,
} from '../services/api/onboardingApi';
import {
  getOnboardingFlow,
  nextOnboardingStep,
  onboardingProgressPercent,
  stepOrderForFlow,
  type OnboardingStepId,
} from '../shared/onboarding/onboardingSteps';
import { usePermissions } from './usePermissions';

const SESSION_DISMISS_KEY = 'pbooks_onboarding_dismissed_session';

function advanceOnboardingStepLocally(
  state: OnboardingState,
  stepId: OnboardingStepId,
  stepData?: Record<string, unknown>
): OnboardingState {
  const flow = getOnboardingFlow(state.stepData);
  const completed = new Set(state.completedSteps);
  completed.add(stepId);
  const nextStep = nextOnboardingStep(stepId, flow) ?? 'completion';
  const merged = stepData ? { ...state.stepData, [stepId]: stepData } : state.stepData;
  const actionable = stepOrderForFlow(flow).filter((id) => id !== 'completion');
  const done = actionable.filter((id) => completed.has(id)).length;
  return {
    ...state,
    currentStep: nextStep,
    completedSteps: [...completed],
    stepData: merged,
    updatedAt: new Date().toISOString(),
    progressPercent: onboardingProgressPercent([...completed], flow),
    onboardingFlow: flow,
    status: done >= actionable.length ? 'completed' : state.status,
    completedAt: done >= actionable.length ? new Date().toISOString() : state.completedAt,
  };
}

function isOnboardingApiFallbackError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  return status === 403 || status === 402;
}

function defaultState(tenantId: string, trialFlow = false): OnboardingState {
  return {
    tenantId,
    status: 'in_progress',
    currentStep: 'welcome',
    completedSteps: [],
    stepData: trialFlow ? { onboarding_flow: 'trial' } : {},
    startedAt: new Date().toISOString(),
    completedAt: null,
    updatedAt: new Date().toISOString(),
    progressPercent: 0,
    onboardingFlow: trialFlow ? 'trial' : 'standard',
  };
}

export function useOnboarding() {
  const { isAuthenticated, tenant } = useAuth();
  const companyCtx = useCompanyOptional();
  const perms = usePermissions();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageId = useMemo(() => {
    if (!isLocalOnlyMode()) return tenant?.id ?? localStorage.getItem('tenant_id') ?? '';
    return companyCtx?.activeCompany?.id ?? 'local';
  }, [tenant?.id, companyCtx?.activeCompany?.id]);

  const canManage = perms.canManageUsers;
  const canAccessOnboarding =
    perms.enterpriseRole === 'company_admin' || perms.enterpriseRole === 'super_admin';

  const load = useCallback(async () => {
    if (!storageId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isLocalOnlyMode()) {
        const local = loadLocalOnboarding(storageId) ?? defaultState(storageId);
        setState(local);
      } else if (isAuthenticated && canAccessOnboarding) {
        const remote = await onboardingApi.get();
        setState(remote);
        saveLocalOnboarding(storageId, remote);
      } else {
        setState(null);
      }
    } catch (err: unknown) {
      const fallback = loadLocalOnboarding(storageId);
      if (fallback) {
        setState(fallback);
      } else if (storageId) {
        setState(defaultState(storageId));
      }
      setError(err instanceof Error ? err.message : 'Could not load onboarding.');
    } finally {
      setLoading(false);
    }
  }, [storageId, isAuthenticated, canAccessOnboarding]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: OnboardingState) => {
      setState(next);
      if (storageId) saveLocalOnboarding(storageId, next);
      if (!isLocalOnlyMode() && isAuthenticated && canAccessOnboarding) {
        try {
          const remote = await onboardingApi.save({
            currentStep: next.currentStep,
            completedSteps: next.completedSteps,
            stepData: next.stepData,
          });
          setState(remote);
          saveLocalOnboarding(storageId, remote);
        } catch {
          /* local copy remains */
        }
      }
    },
    [storageId, isAuthenticated, canAccessOnboarding]
  );

  const completeStep = useCallback(
    async (stepId: OnboardingStepId, stepData?: Record<string, unknown>) => {
      if (!state) return;
      if (isLocalOnlyMode() || !isAuthenticated || !canAccessOnboarding) {
        const next = advanceOnboardingStepLocally(state, stepId, stepData);
        await persist(next);
        return next;
      }
      try {
        const remote = await onboardingApi.completeStep(stepId, stepData);
        setState(remote);
        if (storageId) saveLocalOnboarding(storageId, remote);
        return remote;
      } catch (err: unknown) {
        if (canAccessOnboarding && isOnboardingApiFallbackError(err)) {
          const next = advanceOnboardingStepLocally(state, stepId, stepData);
          await persist(next);
          return next;
        }
        throw err;
      }
    },
    [state, isAuthenticated, canAccessOnboarding, persist, storageId]
  );

  const skipAll = useCallback(async () => {
    if (!isLocalOnlyMode() && isAuthenticated && canAccessOnboarding) {
      const remote = await onboardingApi.skip();
      setState(remote);
      if (storageId) saveLocalOnboarding(storageId, remote);
    } else if (state) {
      const next = { ...state, status: 'skipped' as const, completedAt: new Date().toISOString() };
      await persist(next);
    }
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, [state, isAuthenticated, canAccessOnboarding, persist, storageId]);

  const resumeLater = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const restart = useCallback(async () => {
    if (!isLocalOnlyMode() && isAuthenticated && canAccessOnboarding) {
      const remote = await onboardingApi.restart();
      setState(remote);
      if (storageId) saveLocalOnboarding(storageId, remote);
    } else if (storageId) {
      const fresh = defaultState(storageId);
      setState(fresh);
      saveLocalOnboarding(storageId, fresh);
    }
    setOpen(true);
    try {
      sessionStorage.removeItem(SESSION_DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated, canAccessOnboarding, storageId]);

  const shouldAutoOpen = useMemo(() => {
    if (isDemoModeActive()) return false;
    if (!canAccessOnboarding) return false;
    if (!state || state.status !== 'in_progress') return false;
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') return false;
    } catch {
      /* ignore */
    }
    return true;
  }, [state, canAccessOnboarding]);

  useEffect(() => {
    if (!loading && shouldAutoOpen) setOpen(true);
  }, [loading, shouldAutoOpen]);

  return {
    state,
    loading,
    error,
    open,
    setOpen,
    load,
    persist,
    completeStep,
    skipAll,
    resumeLater,
    restart,
    canManage,
    canAccessOnboarding,
    isComplete: state?.status === 'completed' || state?.status === 'skipped',
  };
}
