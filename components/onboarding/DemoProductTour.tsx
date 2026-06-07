import { useEffect } from 'react';

import { DEMO_TOUR_DISMISSED_KEY } from '../../config/demoEnvironment';

import { useProductTour } from '../../context/ProductTourContext';



/** Auto-starts the demo overview tour in the live demo environment. */

const DemoProductTour: React.FC = () => {

  const { startTour } = useProductTour();



  useEffect(() => {

    try {

      if (sessionStorage.getItem(DEMO_TOUR_DISMISSED_KEY) === '1') return;

    } catch {

      /* ignore */

    }

    const t = window.setTimeout(() => {

      startTour('demo_overview');

    }, 1200);

    return () => window.clearTimeout(t);

  }, [startTour]);



  return null;

};



export default DemoProductTour;

