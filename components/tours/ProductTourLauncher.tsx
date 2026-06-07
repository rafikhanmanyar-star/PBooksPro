import React from 'react';
import { Play, RotateCcw, CheckCircle2, PauseCircle } from 'lucide-react';
import Button from '../ui/Button';
import {
  PRODUCT_TOURS,
  PRODUCT_TOUR_IDS,
  type ProductTourId,
} from '../../shared/tours/productTourDefinitions';
import { useProductTour } from '../../context/ProductTourContext';
import { clearTourProgress } from '../../services/tours/productTourStorage';

function statusLabel(tourId: ProductTourId, progress: ReturnType<typeof useProductTour>['progress']): string {
  const entry = progress[tourId];
  if (!entry) return 'Not started';
  if (entry.status === 'completed') return 'Completed';
  if (entry.status === 'skipped') return 'Skipped';
  return `In progress · step ${entry.stepIndex + 1}`;
}

const ProductTourLauncher: React.FC = () => {
  const { startTour, progress, activeTourId } = useProductTour();

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Interactive walkthroughs highlight key controls in each module. Progress is saved automatically — resume anytime.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCT_TOUR_IDS.map((tourId) => {
          const tour = PRODUCT_TOURS[tourId];
          const entry = progress[tourId];
          const isActive = activeTourId === tourId;
          const completed = entry?.status === 'completed';
          const inProgress = entry?.status === 'in_progress' && !completed;

          return (
            <div
              key={tourId}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-slate-800">{tour.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{tour.description}</p>
                </div>
                {completed && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden />}
                {inProgress && <PauseCircle className="w-5 h-5 text-indigo-500 shrink-0" aria-hidden />}
              </div>
              <p className="text-xs text-slate-500">{statusLabel(tourId, progress)}</p>
              <div className="flex flex-wrap gap-2 mt-auto">
                <Button
                  size="sm"
                  onClick={() => startTour(tourId, { resume: inProgress })}
                  disabled={isActive}
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  {inProgress ? 'Resume' : 'Start tour'}
                </Button>
                {entry && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      clearTourProgress(tourId);
                      startTour(tourId);
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Restart
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProductTourLauncher;
