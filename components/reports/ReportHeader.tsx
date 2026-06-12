import { usePrintSettings } from '../../hooks/useSelectiveState';
import React from 'react';

export interface ReportHeaderProps {
    /** Optional report title rendered below company name */
    reportTitle?: string;
}

const ReportHeader: React.FC<ReportHeaderProps> = ({ reportTitle }) => {
    const printSettings = usePrintSettings();

    if (!printSettings) return null;

    const { companyName, companyAddress, companyContact, logoUrl, showLogo, headerText } = printSettings;

    return (
        <div className="report-branding-header mb-8 border-b-2 border-app-border pb-4">
            <div className="flex justify-between items-start">
                <div className="flex gap-4 items-center">
                    {showLogo && logoUrl && (
                        <img src={logoUrl} alt="Company Logo" className="h-20 w-auto object-contain" />
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-app-text uppercase tracking-wide">{companyName}</h1>
                        {headerText && <p className="text-sm text-app-muted font-medium italic mt-1">{headerText}</p>}
                        {reportTitle && (
                            <p className="text-base font-semibold text-app-text mt-2 normal-case tracking-normal">{reportTitle}</p>
                        )}
                    </div>
                </div>
                <div className="text-right text-sm text-app-muted">
                    <div className="whitespace-pre-wrap">{companyAddress}</div>
                    <div className="mt-1 font-medium">{companyContact}</div>
                </div>
            </div>
        </div>
    );
};

export default ReportHeader;