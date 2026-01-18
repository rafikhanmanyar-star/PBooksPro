
import React, { memo } from 'react';

const BizPlanetPage: React.FC = () => {
    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Biz Planet</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">B2B business platform</p>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow flex items-center justify-center">
                <div className="text-center text-slate-400">
                    <p className="text-sm">Content coming soon...</p>
                </div>
            </div>
        </div>
    );
};

export default memo(BizPlanetPage);
