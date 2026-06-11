import { usePrintSettings } from '../../hooks/useSelectiveState';
import React from 'react';
const ReportFooter: React.FC = () => {
    const printSettings = usePrintSettings();

    if (!printSettings) return null;

    return (
        <div className="report-branding-footer mt-8 pt-4 border-t border-slate-300 text-center text-xs text-slate-500">
             {printSettings.footerText && <p className="font-medium mb-1">{printSettings.footerText}</p>}
             {printSettings.showDatePrinted && <p>Printed on: {new Date().toLocaleString()}</p>}
        </div>
    );
};

export default ReportFooter;