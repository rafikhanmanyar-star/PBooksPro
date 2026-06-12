import { useEffect } from 'react';

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

/** Auto-starts the end-to-end demo tour in the live demo environment. */
const DemoProductTour: React.FC = () => {
  const { startTour } = useProductTour();

  useEffect(() => {
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
      startTour(DEMO_TOUR_ID, { startAtStep, forceStart: true });
      clearDemoTourQueryParams();
    }, 1200);

    return () => window.clearTimeout(t);
  }, [startTour]);

  useEffect(() => {
    const onRestart = () => {
      resetDemoTourSession();
      const startAtStep = readDemoTourStepFromLocation(window.location.search);
      startTour(DEMO_TOUR_ID, { startAtStep, forceStart: true });
    };
    window.addEventListener('pbooks:restart-demo-tour', onRestart);
    return () => window.removeEventListener('pbooks:restart-demo-tour', onRestart);
  }, [startTour]);

  return null;
};

export default DemoProductTour;
