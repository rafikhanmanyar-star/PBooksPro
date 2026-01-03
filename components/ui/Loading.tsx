import React, { memo } from 'react';

interface LoadingProps {
  message?: string;
  className?: string;
}

const Loading: React.FC<LoadingProps> = ({ message = 'Loading...', className = '' }) => {
  return (
    <div className={`flex items-center justify-center h-full w-full min-h-[200px] ${className}`}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-slate-500 text-sm font-medium animate-pulse">{message}</p>
      </div>
    </div>
  );
};

export default memo(Loading);
