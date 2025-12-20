
import React from 'react';
import { ICONS } from '../../constants';

interface ResizeHandleProps {
    onMouseDown: (e: React.MouseEvent) => void;
    className?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ onMouseDown, className = '' }) => {
    return (
        <div
            className={`w-4 -ml-2 z-50 cursor-col-resize flex items-center justify-center group h-full select-none touch-none ${className}`}
            onMouseDown={onMouseDown}
            title="Drag to resize"
        >
            {/* The visual line */}
            <div className="w-1 h-full bg-slate-200 group-hover:bg-indigo-400 transition-colors duration-200 rounded-full relative">
                {/* The center grip handle */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-8 bg-white border border-slate-300 group-hover:border-indigo-400 rounded-md shadow-sm flex items-center justify-center">
                    <div className="flex gap-0.5">
                        <div className="w-0.5 h-4 bg-slate-300 group-hover:bg-indigo-400 rounded-full"></div>
                        <div className="w-0.5 h-4 bg-slate-300 group-hover:bg-indigo-400 rounded-full"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResizeHandle;
