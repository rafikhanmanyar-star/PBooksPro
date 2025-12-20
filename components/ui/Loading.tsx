
import React, { memo } from 'react';

const Loading: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full w-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-green-600 rounded-full animate-spin"></div>
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading...</p>
      </div>
    </div>
  );
};

export default memo(Loading);
