
import React from 'react';
import { useProgress } from '../../context/ProgressContext';
import { ICONS } from '../../constants';
import Button from './Button';

const ProgressDisplay: React.FC = () => {
    const { progressState, resetProgress } = useProgress();
    const { status, title, message, progress } = progressState;

    if (status === 'idle') {
        return null;
    }

    const isError = status === 'error';
    const isSuccess = status === 'success';

    const progressColor = isError ? 'bg-danger' : isSuccess ? 'bg-success' : 'bg-accent';
    const CheckCircleIcon = <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;
    const iconColor = isError ? 'text-danger' : isSuccess ? 'text-success' : 'text-accent';

    const displayIcon = isError ? ICONS.alertTriangle : isSuccess ? CheckCircleIcon : ICONS.trendingUp;


    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-70 z-[100] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-fade-in-fast" role="alertdialog" aria-modal="true" aria-labelledby="progress-title" aria-describedby="progress-message">
            <div className="bg-slate-50 rounded-t-lg sm:rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 flex-shrink-0 ${iconColor}`}>
                         {status === 'running' && !isError && !isSuccess ? (
                            <div className="relative w-10 h-10" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                                <svg className="w-full h-full" viewBox="0 0 36 36">
                                    <path className="text-slate-200" strokeWidth="4" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    <path className={`transition-all duration-300 ${progressColor.replace('bg-', 'text-')}`} strokeWidth="4" fill="none" strokeDasharray={`${progress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" strokeLinecap="round" transform="rotate(-90 18 18)" />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-600">{Math.round(progress)}%</span>
                            </div>
                         ) : (
                            displayIcon
                         )}
                    </div>
                    <div className="flex-grow">
                        <h2 className="text-lg font-semibold text-slate-800" id="progress-title">{title}</h2>
                        <p className="text-sm text-slate-600 mt-1" id="progress-message">{message}</p>
                    </div>
                </div>

                {status === 'running' && (
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-4" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-labelledby="progress-message">
                        <div className={`h-2 rounded-full transition-all duration-300 ${progressColor}`} style={{ width: `${progress}%` }}></div>
                    </div>
                )}
                
                {(isError || isSuccess) && (
                    <div className="mt-6 flex justify-end">
                        <Button onClick={resetProgress}>Close</Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProgressDisplay;
