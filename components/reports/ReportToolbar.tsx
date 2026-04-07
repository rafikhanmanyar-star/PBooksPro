import React from 'react';
import { ICONS } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import { toLocalDateString } from '../../utils/dateUtils';

export type ReportDateRange = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface ReportToolbarProps {
    startDate?: string;
    endDate?: string;
    onDateChange?: (start: string, end: string) => void;
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    onExport?: () => void;
    onPrint?: () => void;
    onWhatsApp?: () => void;
    disableWhatsApp?: boolean;
    hideGroup?: boolean;
    hideDate?: boolean;
    hideSearch?: boolean;
    groupBy?: string;
    onGroupByChange?: (value: string) => void;
    groupByOptions?: { label: string; value: string }[];
    children?: React.ReactNode;
    
    // Unified Date Range Props
    showDateFilterPills?: boolean;
    activeDateRange?: ReportDateRange;
    onRangeChange?: (range: ReportDateRange) => void;
    singleDateMode?: boolean; // For balance sheet "As of" date
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({
    startDate,
    endDate,
    onDateChange,
    searchQuery,
    onSearchChange,
    onExport,
    onPrint,
    onWhatsApp,
    disableWhatsApp,
    hideGroup,
    hideDate,
    hideSearch,
    groupBy,
    onGroupByChange,
    groupByOptions,
    children,
    showDateFilterPills,
    activeDateRange,
    onRangeChange,
    singleDateMode
}) => {
    return (
        <div className="bg-app-card p-2 sm:p-3 rounded-lg border border-app-border shadow-ds-card no-print space-y-3">
            <div className="flex flex-col xl:flex-row gap-3 justify-between items-start xl:items-center">
                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                    {/* Date Pills */}
                    {showDateFilterPills && onRangeChange && (
                        <div className="flex bg-app-toolbar p-0.5 rounded-lg flex-shrink-0 overflow-x-auto max-w-full border border-app-border">
                            {(['all', 'thisMonth', 'lastMonth', 'custom'] as ReportDateRange[]).map(opt => (
                                <button
                                    type="button"
                                    key={opt}
                                    onClick={() => onRangeChange(opt)}
                                    className={`px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                        activeDateRange === opt 
                                        ? 'bg-app-card text-primary shadow-sm font-bold border border-primary/25' 
                                        : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                    }`}
                                >
                                    {opt === 'all' ? 'All' : opt === 'thisMonth' ? 'This Mo' : opt === 'lastMonth' ? 'Last Mo' : 'Custom'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Custom Date Pickers */}
                    {!hideDate && onDateChange && (activeDateRange === 'custom' || !showDateFilterPills) && (
                        <div className="flex items-center gap-1 sm:gap-2 animate-fade-in flex-shrink-0 text-xs">
                            {singleDateMode ? (
                                <div className="flex items-center gap-2 bg-app-card px-2 py-1 rounded-md border border-app-border">
                                    <span className="text-xs text-app-muted font-medium uppercase mr-1">As Of:</span>
                                    <div className="w-24 sm:w-auto"><DatePicker value={startDate || ''} onChange={(d) => onDateChange(toLocalDateString(d), toLocalDateString(d))} /></div>
                                </div>
                            ) : (
                                <>
                                    <div className="w-24 sm:w-auto"><DatePicker value={startDate || ''} onChange={(d) => onDateChange(toLocalDateString(d), endDate || '')} /></div>
                                    <span className="text-app-muted">-</span>
                                    <div className="w-24 sm:w-auto"><DatePicker value={endDate || ''} onChange={(d) => onDateChange(startDate || '', toLocalDateString(d))} /></div>
                                </>
                            )}
                        </div>
                    )}
                    
                    {/* Children Filters */}
                    {children}
                </div>

                <div className="flex items-center gap-2 ml-auto flex-shrink-0 self-end xl:self-auto">
                    {onWhatsApp && (
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={onWhatsApp} 
                            disabled={disableWhatsApp}
                            className="text-ds-success bg-ds-success/10 hover:bg-ds-success/15 border-ds-success/30 px-2 sm:px-3 h-8"
                            title="Share on WhatsApp"
                        >
                            <div className="w-4 h-4">{ICONS.whatsapp}</div> <span className="hidden sm:inline ml-1">Share</span>
                        </Button>
                    )}
                    {onExport && (
                        <Button variant="secondary" size="sm" onClick={onExport} className="bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border px-2 sm:px-3 h-8" title="Export to Excel">
                            <div className="w-4 h-4">{ICONS.export}</div> <span className="hidden sm:inline ml-1">Export</span>
                        </Button>
                    )}
                    {onPrint && (
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={onPrint}
                            className="px-2 sm:px-3 h-8"
                            showLabel={true}
                        />
                    )}
                </div>
            </div>

            {/* Second Row: Search and Grouping */}
            {(!hideSearch || (!hideGroup && onGroupByChange)) && (
                <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-app-border">
                    {!hideGroup && onGroupByChange && (
                        <div className="w-40 flex-shrink-0">
                            <Select 
                                value={groupBy || ''} 
                                onChange={(e) => onGroupByChange(e.target.value)}
                                className="py-1.5 text-xs sm:text-sm"
                            >
                                <option value="">No Grouping</option>
                                {groupByOptions?.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </Select>
                        </div>
                    )}

                    {!hideSearch && onSearchChange && (
                         <div className="relative flex-grow min-w-[150px]">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted">
                                <span className="h-3.5 w-3.5">{ICONS.search}</span>
                            </div>
                            <Input 
                                placeholder="Search report..." 
                                value={searchQuery} 
                                onChange={(e) => onSearchChange(e.target.value)} 
                                className="ds-input-field pl-8 py-1.5 text-xs sm:text-sm placeholder:text-app-muted"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => onSearchChange('')} 
                                    type="button"
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                >
                                    <div className="w-3.5 h-3.5">{ICONS.x}</div>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportToolbar;