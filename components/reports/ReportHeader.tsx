import React from 'react';
import { useAppContext } from '../../context/AppContext';

const ReportHeader: React.FC = () => {
    const { state } = useAppContext();
    const { printSettings } = state;

    if (!printSettings) return null;

    const { companyName, companyAddress, companyContact, logoUrl, showLogo, headerText } = printSettings;

    return (
        <div className="mb-8 border-b-2 border-slate-800 pb-4 hidden print:block">
            <div className="flex justify-between items-start">
                <div className="flex gap-4 items-center">
                    {showLogo && logoUrl && (
                        <img src={logoUrl} alt="Company Logo" className="h-20 w-auto object-contain" />
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-wide">{companyName}</h1>
                        {headerText && <p className="text-sm text-slate-500 font-medium italic mt-1">{headerText}</p>}
                    </div>
                </div>
                <div className="text-right text-sm text-slate-600">
                    <div className="whitespace-pre-wrap">{companyAddress}</div>
                    <div className="mt-1 font-medium">{companyContact}</div>
                </div>
            </div>
        </div>
    );
};

export default ReportHeader;