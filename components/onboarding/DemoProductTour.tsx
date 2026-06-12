import { useEffect, useRef } from 'react';

import { DEMO_TOUR_DISMISSED_KEY } from '../../config/demoEnvironment';
import { useProductTour } from '../../context/ProductTourContext';
import {
  DEMO_TOUR_ID,
  readDemoTourStepFromLocation,
} from '../../shared/tours/demoTourMeta';
import {
  ensureDemoTourVersionFresh,
  resetDemoTourSession,
} from '../../services/tours/demoTourSession';
import { clearDemoTourQueryParams } from '../../utils/demoAuthBootstrap';

/** Auto-starts the end-to-end demo tour in the live demo environment (once per app load). */
const DemoProductTour: React.FC = () => {
  const { startTour } = useProductTour();
  const startTourRef = useRef(startTour);
  const autoStartedRef = useRef(false);

  startTourRef.current = startTour;

  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;

    ensureDemoTourVersionFresh();

    const startAtStep = readDemoTourStepFromLocation(window.location.search);

    try {
      if (sessionStorage.getItem(DEMO_TOUR_DISMISSED_KEY) === '1' && startAtStep === 0) {
        return;
      }
    } catch {
      /* ignore */
    }

    const t = window.setTimeout(() => {
      startTourRef.current(DEMO_TOUR_ID, { startAtStep, forceStart: true });
      clearDemoTourQueryParams();
    }, 1200);

    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onRestart = () => {
      resetDemoTourSession();
      const startAtStep = readDemoTourStepFromLocation(window.location.search);
      startTourRef.current(DEMO_TOUR_ID, { startAtStep, forceStart: true });
    };
    window.addEventListener('pbooks:restart-demo-tour', onRestart);
    return () => window.removeEventListener('pbooks:restart-demo-tour', onRestart);
  }, []);

  return null;
};

export default DemoProductTour;
