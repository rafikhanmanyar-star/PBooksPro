import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useDispatchOnly, useStateSelector } from '../hooks/useSelectiveState';
import { useKpis } from './KPIContext';
import { useAuth } from './AuthContext';
import {
  getTourDefinition,
  PRODUCT_TOUR_IDS,
  type ProductTourId,
} from '../shared/tours/productTourDefinitions';
import {
  getTourProgress,
  loadTourProgress,
  updateTourProgress,
  type TourProgressStore,
} from '../services/tours/productTourStorage';
import { trackEvent } from '../services/analytics/trackEvent';
import { DEMO_TOUR_DISMISSED_KEY } from '../config/demoEnvironment';
import ProductTourOverlay from '../components/tours/ProductTourOverlay';
import type { Page } from '../types';

type ProductTourContextValue = {
  activeTourId: ProductTourId | null;
  stepIndex: number;
  progress: TourProgressStore;
  startTour: (tourId: ProductTourId, options?: { resume?: boolean; startAtStep?: number; forceStart?: boolean }) => void;
  stopTour: () => void;
};

const ProductTourContext = createContext<ProductTourContextValue | undefined>(undefined);

function waitForSelector(selector: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (document.querySelector(selector)) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export const ProductTourProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const dispatch = useDispatchOnly();
  const currentPage = useStateSelector((s) => s.currentPage);
  const { isPanelOpen, togglePanel, setActivePanelTab } = useKpis();
  const { isAuthenticated } = useAuth();

  const [activeTourId, setActiveTourId] = useState<ProductTourId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState<TourProgressStore>(() => loadTourProgress());
  const prepareGenerationRef = useRef(0);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const refreshProgress = useCallback(() => {
    setProgress(loadTourProgress());
  }, []);

  const runPrepare = useCallback(
    async (
      prepare?:
        | 'openKpiPanel'
        | 'openKpiReports'
        | 'openAccountingTrialBalance'
        | 'openAccountingOverviewReport'
        | 'openAccountingProfitLoss'
        | 'openSettingsContacts'
        | 'openSettingsAssets'
        | 'openSettingsChartOfAccounts'
        | 'openProjectSellingMarketing'
        | 'openProjectSellingAgreements'
        | 'openProjectSellingInvoices'
        | 'openProjectSellingCollections'
        | 'openProjectConstructionContracts'
        | 'openProjectConstructionBills'
        | 'openRentalAgreements'
        | 'openRentalInvoices'
        | 'openRentalCollections'
    ) => {
      if (!prepare) return;

      const openSettingsTab = (categoryId: string) => {
        try {
          sessionStorage.setItem('openSettingsCategory', categoryId);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { categoryId } }));
      };

      if (prepare === 'openSettingsContacts') {
        openSettingsTab('contacts');
        await new Promise((r) => setTimeout(r, 350));
      } else if (prepare === 'openSettingsAssets') {
        openSettingsTab('assets');
        await new Promise((r) => setTimeout(r, 350));
      } else if (prepare === 'openSettingsChartOfAccounts') {
        openSettingsTab('accounts');
        await new Promise((r) => setTimeout(r, 350));
      } else if (prepare.startsWith('openProjectSelling')) {
        const view =
          prepare === 'openProjectSellingMarketing'
            ? 'Marketing'
            : prepare === 'openProjectSellingAgreements'
              ? 'Agreements'
              : prepare === 'openProjectSellingInvoices'
                ? 'Invoices'
                : 'Collections Analytics';
        dispatch({ type: 'SET_INITIAL_TABS', payload: [view] });
        await new Promise((r) => setTimeout(r, 350));
      } else if (prepare.startsWith('openProjectConstruction')) {
        const view = prepare === 'openProjectConstructionContracts' ? 'Contracts' : 'Bills';
        dispatch({ type: 'SET_INITIAL_TABS', payload: [view] });
        await new Promise((r) => setTimeout(r, 350));
      } else if (prepare.startsWith('openRental')) {
        const view =
          prepare === 'openRentalAgreements'
            ? 'Agreements'
            : prepare === 'openRentalInvoices'
              ? 'Invoices'
              : 'Collections Analytics';
        dispatch({ type: 'SET_INITIAL_TABS', payload: [view] });
        await new Promise((r) => setTimeout(r, 350));
      } else if (prepare === 'openKpiPanel' || prepare === 'openKpiReports') {
        if (!isPanelOpen) togglePanel();
        if (prepare === 'openKpiReports') {
          await new Promise((r) => setTimeout(r, 200));
          setActivePanelTab('reports');
        }
      } else if (prepare === 'openAccountingTrialBalance') {
        dispatch({ type: 'SET_INITIAL_TABS', payload: ['Reports', 'Trial Balance'] });
        await new Promise((r) => setTimeout(r, 500));
      } else if (prepare === 'openAccountingOverviewReport') {
        dispatch({ type: 'SET_INITIAL_TABS', payload: ['Reports', 'Overview Reports'] });
        await new Promise((r) => setTimeout(r, 500));
      } else if (prepare === 'openAccountingProfitLoss') {
        dispatch({ type: 'SET_INITIAL_TABS', payload: ['Profit & Loss'] });
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    [dispatch, isPanelOpen, togglePanel, setActivePanelTab]
  );

  const navigateIfNeeded = useCallback(
    async (page?: Page) => {
      if (!page || currentPageRef.current === page) return;
      dispatch({ type: 'SET_PAGE', payload: page });
      await new Promise((r) => setTimeout(r, 500));
    },
    [dispatch]
  );

  const prepareStep = useCallback(
    async (tourId: ProductTourId, index: number) => {
      const generation = ++prepareGenerationRef.current;
      const tour = getTourDefinition(tourId);
      const step = tour.steps[index];
      if (!step) return;

      await navigateIfNeeded(step.page);
      if (generation !== prepareGenerationRef.current) return;

      await runPrepare(step.prepare);
      if (generation !== prepareGenerationRef.current) return;

      await waitForSelector(step.selector, step.page === 'settings' ? 8000 : 5000);
    },
    [navigateIfNeeded, runPrepare]
  );

  const startTour = useCallback(
    (tourId: ProductTourId, options?: { resume?: boolean; startAtStep?: number; forceStart?: boolean }) => {
      const tour = getTourDefinition(tourId);
      const saved = getTourProgress(tourId);
      let startIndex = 0;

      if (options?.startAtStep != null) {
        startIndex = Math.max(0, Math.min(options.startAtStep, tour.steps.length - 1));
      } else if (options?.resume && saved?.status === 'in_progress' && !options?.forceStart) {
        startIndex = saved.stepIndex;
      }

      setActiveTourId(tourId);
      setStepIndex(startIndex);
      updateTourProgress(tourId, { stepIndex: startIndex, status: 'in_progress' });
      refreshProgress();

      trackEvent(options?.resume ? 'product_tour_resumed' : 'product_tour_started', {
        tourId,
        stepIndex: startIndex,
      });

      void prepareStep(tourId, startIndex);
    },
    [prepareStep, refreshProgress]
  );

  const stopTour = useCallback(() => {
    setActiveTourId(null);
  }, []);

  /** Tour overlay (z-[10040]) blocks the login form if still active after logout. */
  useEffect(() => {
    if (!isAuthenticated && activeTourId) {
      stopTour();
    }
  }, [isAuthenticated, activeTourId, stopTour]);

  const persistStep = useCallback(
    (tourId: ProductTourId, index: number, status: 'in_progress' | 'completed' | 'skipped') => {
      updateTourProgress(tourId, { stepIndex: index, status });
      refreshProgress();
    },
    [refreshProgress]
  );

  const goToStep = useCallback(
    (nextIndex: number) => {
      if (!activeTourId) return;
      const tour = getTourDefinition(activeTourId);
      const clamped = Math.max(0, Math.min(nextIndex, tour.steps.length - 1));
      setStepIndex(clamped);
      persistStep(activeTourId, clamped, 'in_progress');
      const step = tour.steps[clamped];
      trackEvent('product_tour_step_viewed', {
        tourId: activeTourId,
        stepId: step?.id,
        stepIndex: clamped,
      });
      void prepareStep(activeTourId, clamped);
    },
    [activeTourId, persistStep, prepareStep]
  );

  const handleNext = useCallback(() => {
    if (!activeTourId) return;
    goToStep(stepIndex + 1);
  }, [activeTourId, goToStep, stepIndex]);

  const handleBack = useCallback(() => {
    if (!activeTourId) return;
    goToStep(stepIndex - 1);
  }, [activeTourId, goToStep, stepIndex]);

  const handleSkip = useCallback(() => {
    if (!activeTourId) return;
    trackEvent('product_tour_skipped', { tourId: activeTourId, stepIndex });
    persistStep(activeTourId, stepIndex, 'skipped');
    if (activeTourId === 'demo_overview') {
      try {
        sessionStorage.setItem(DEMO_TOUR_DISMISSED_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    setActiveTourId(null);
  }, [activeTourId, persistStep, stepIndex]);

  const handleResumeLater = useCallback(() => {
    if (!activeTourId) return;
    trackEvent('product_tour_paused', { tourId: activeTourId, stepIndex });
    persistStep(activeTourId, stepIndex, 'in_progress');
    if (activeTourId === 'demo_overview') {
      try {
        sessionStorage.setItem(DEMO_TOUR_DISMISSED_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    setActiveTourId(null);
  }, [activeTourId, persistStep, stepIndex]);

  const handleComplete = useCallback(() => {
    if (!activeTourId) return;
    trackEvent('product_tour_completed', { tourId: activeTourId });
    persistStep(activeTourId, stepIndex, 'completed');
    if (activeTourId === 'demo_overview') {
      try {
        sessionStorage.setItem(DEMO_TOUR_DISMISSED_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    setActiveTourId(null);
  }, [activeTourId, persistStep, stepIndex]);

  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<{ tourId: ProductTourId; resume?: boolean }>).detail;
      if (detail?.tourId) startTour(detail.tourId, { resume: detail.resume });
    };
    window.addEventListener('pbooks:start-tour', onStart);
    return () => window.removeEventListener('pbooks:start-tour', onStart);
  }, [startTour]);

  const value = useMemo(
    () => ({
      activeTourId,
      stepIndex,
      progress,
      startTour,
      stopTour,
    }),
    [activeTourId, stepIndex, progress, startTour, stopTour]
  );

  const activeTour = activeTourId ? getTourDefinition(activeTourId) : null;

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {activeTour && (
        <ProductTourOverlay
          tour={activeTour}
          stepIndex={stepIndex}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
          onResumeLater={handleResumeLater}
          onComplete={handleComplete}
          badgeLabel={activeTourId === 'demo_overview' ? 'Live demo tour' : 'Guided tour'}
          footerNote={
            activeTourId === 'demo_overview'
              ? 'Demo data resets daily. Your changes do not affect the master template.'
              : undefined
          }
        />
      )}
    </ProductTourContext.Provider>
  );
};

export function useProductTour(): ProductTourContextValue {
  const ctx = useContext(ProductTourContext);
  if (!ctx) throw new Error('useProductTour must be used within ProductTourProvider');
  return ctx;
}

export function useProductTourOptional(): ProductTourContextValue | null {
  return useContext(ProductTourContext) ?? null;
}

export { PRODUCT_TOUR_IDS };
