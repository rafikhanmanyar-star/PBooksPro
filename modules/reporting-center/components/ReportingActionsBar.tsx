import React from 'react';
import { ChevronDown, FileDown, FileSpreadsheet, Play, Printer } from 'lucide-react';
import Button from '../../../components/ui/Button';

export const ReportingActionsBar: React.FC<{
  onGenerate: () => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  loading?: boolean;
  quickReportLabels?: string[];
  onQuickReport?: (label: string) => void;
  children?: React.ReactNode;
}> = ({
  onGenerate,
  onExportPdf,
  onExportExcel,
  onPrint,
  loading,
  quickReportLabels,
  onQuickReport,
  children,
}) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onGenerate} className="text-xs gap-1.5" disabled={loading}>
          <Play className="w-3.5 h-3.5" /> Generate
        </Button>
        <Button variant="secondary" onClick={onExportPdf} className="text-xs gap-1.5">
          <FileDown className="w-3.5 h-3.5" /> Export PDF
        </Button>
        <Button variant="secondary" onClick={onExportExcel} className="text-xs gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
        </Button>
        <Button variant="secondary" onClick={onPrint} className="text-xs gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Print Preview
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {quickReportLabels && onQuickReport && (
          <div className="relative" ref={ref}>
            <Button variant="secondary" onClick={() => setOpen((o) => !o)} className="text-xs gap-1">
              Quick Reports
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
            {open && (
              <div className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-lg border border-app-border bg-app-card shadow-lg py-1 max-h-72 overflow-y-auto">
                {quickReportLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-app-text hover:bg-app-table-hover"
                    onClick={() => { onQuickReport(label); setOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
