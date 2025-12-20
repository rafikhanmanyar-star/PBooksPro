import React from 'react';
import { useAppContext } from '../../context/AppContext';

const ReportFooter: React.FC = () => {
    const { state } = useAppContext();
    const { printSettings } = state;

    if (!printSettings) return null;

    return (
        <div className="mt-8 pt-4 border-t border-slate-300 text-center text-xs text-slate-500 hidden print:block">
             {printSettings.footerText && <p className="font-medium mb-1">{printSettings.footerText}</p>}
             {printSettings.showDatePrinted && <p>Printed on: {new Date().toLocaleString()}</p>}
        </div>
    );
};

export default ReportFooter;