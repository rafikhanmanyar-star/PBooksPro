import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTenant360 } from '../hooks/useRentalReporting';
import { CURRENCY } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';

export const Tenant360Drawer: React.FC<{ contactId: string | null; onClose: () => void }> = ({ contactId, onClose }) => {
  const q = useTenant360(contactId);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {contactId && (
        <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60]">
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="absolute top-0 right-0 h-full w-full max-w-lg bg-app-card shadow-2xl border-l border-app-border flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
              <div>
                <h2 className="text-lg font-bold">Tenant 360</h2>
                <p className="text-xs text-app-muted">{q.data?.profile.name ?? 'Loading…'}</p>
              </div>
              <button type="button" className="p-2 rounded-lg hover:bg-app-table-hover" onClick={onClose}><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
              {q.isLoading && <p className="text-app-muted">Loading…</p>}
              {q.data && (
                <>
                  <Section title="Profile">
                    {q.data.profile.contactNo && <Row label="Phone" value={q.data.profile.contactNo} />}
                    {q.data.profile.address && <Row label="Address" value={q.data.profile.address} />}
                  </Section>
                  <Section title="Properties">
                    {q.data.properties.map((p) => (
                      <div key={p.propertyId} className="rounded-lg border border-app-border p-2 mb-2">
                        <p className="font-medium">{p.propertyName}</p>
                        <p className="text-xs text-app-muted">{p.buildingName} · {p.agreementNo}</p>
                        <p className="text-xs">{p.status} · {CURRENCY} {p.monthlyRent.toLocaleString()}</p>
                      </div>
                    ))}
                  </Section>
                  <Section title="Financial summary">
                    <Grid>
                      <Metric label="Invoiced" value={`${CURRENCY} ${q.data.financial.invoiced.toLocaleString()}`} />
                      <Metric label="Collected" value={`${CURRENCY} ${q.data.financial.collected.toLocaleString()}`} />
                      <Metric label="Outstanding" value={`${CURRENCY} ${q.data.financial.outstanding.toLocaleString()}`} emphasize />
                      <Metric label="Overdue" value={`${CURRENCY} ${q.data.financial.overdueAmount.toLocaleString()}`} />
                    </Grid>
                  </Section>
                  <Section title="Payment timeline">
                    {q.data.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs border-b border-app-border/40 py-1">
                        <span>{formatDate(p.date)}</span>
                        <span className="text-ds-success">{CURRENCY} {p.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </Section>
                  <Section title="Notes">
                    {q.data.notes.length ? q.data.notes.map((n, i) => <p key={i} className="text-xs border border-app-border/50 p-2 rounded mb-1">{n}</p>) : <p className="text-xs text-app-muted">No notes.</p>}
                  </Section>
                  <Section title="Documents">
                    {q.data.documents.map((d) => (
                      <div key={d.id} className="flex justify-between text-xs"><span>{d.name}</span><span className="text-app-muted">{d.type}</span></div>
                    ))}
                  </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">{title}</h3>{children}</section>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-xs"><span className="text-app-muted">{label}</span><span>{value}</span></div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg bg-app-toolbar border border-app-border p-2">
      <p className="text-[10px] uppercase text-app-muted">{label}</p>
      <p className={`tabular-nums text-xs ${emphasize ? 'font-bold text-ds-primary' : ''}`}>{value}</p>
    </div>
  );
}
