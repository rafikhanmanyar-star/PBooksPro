import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useVendor360 } from '../hooks/useConstructionReporting';
import { CURRENCY } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';

export const Vendor360Drawer: React.FC<{ vendorId: string | null; onClose: () => void }> = ({ vendorId, onClose }) => {
  const q = useVendor360(vendorId);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {vendorId && (
        <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60]">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
          <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute top-0 right-0 h-full w-full max-w-lg bg-app-card border-l border-app-border flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
              <div><h2 className="text-lg font-bold">Vendor 360</h2><p className="text-xs text-app-muted">{q.data?.profile.name ?? 'Loading…'}</p></div>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-app-table-hover"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
              {q.data && (
                <>
                  <section>
                    <h3 className="text-xs font-bold uppercase text-app-muted mb-2">Contracts</h3>
                    {q.data.contracts.map((c) => (
                      <div key={c.contractId} className="border border-app-border rounded-lg p-2 mb-2">
                        <p className="font-medium">{c.contractName}</p>
                        <p className="text-xs text-app-muted">{c.projectName} · {c.contractNo}</p>
                        <p className="text-xs">{c.status} · {CURRENCY} {c.totalAmount.toLocaleString()}</p>
                      </div>
                    ))}
                  </section>
                  <section>
                    <h3 className="text-xs font-bold uppercase text-app-muted mb-2">Financial summary</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Metric label="Billed" value={`${CURRENCY} ${q.data.financial.billed.toLocaleString()}`} />
                      <Metric label="Paid" value={`${CURRENCY} ${q.data.financial.paid.toLocaleString()}`} />
                      <Metric label="Outstanding" value={`${CURRENCY} ${q.data.financial.outstanding.toLocaleString()}`} emphasize />
                      <Metric label="Overdue" value={`${CURRENCY} ${q.data.financial.overdueAmount.toLocaleString()}`} />
                    </div>
                  </section>
                  <section>
                    <h3 className="text-xs font-bold uppercase text-app-muted mb-2">Payment timeline</h3>
                    {q.data.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs py-1 border-b border-app-border/40">
                        <span>{formatDate(p.date)}</span><span>{CURRENCY} {p.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </section>
                  <section>
                    <h3 className="text-xs font-bold uppercase text-app-muted mb-2">Notes</h3>
                    {q.data.notes.length ? q.data.notes.map((n, i) => <p key={i} className="text-xs border p-2 rounded mb-1">{n}</p>) : <p className="text-xs text-app-muted">No notes.</p>}
                  </section>
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg bg-app-toolbar border border-app-border p-2">
      <p className="text-[10px] uppercase text-app-muted">{label}</p>
      <p className={`tabular-nums ${emphasize ? 'font-bold text-ds-primary' : ''}`}>{value}</p>
    </div>
  );
}
