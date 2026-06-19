/**
 * TEMPORARY staging-only UI to enable payment-disappearance tracing without DevTools.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { isStagingEnvironment } from '../../config/apiUrl';
import {
  clearPaymentTraceBuffer,
  clearPaymentTraceWatchTarget,
  formatPaymentTraceForExport,
  getPaymentTraceBuffer,
  getPaymentTraceWatchTarget,
  hasPaymentTraceWatchTarget,
  isPaymentDisappearTraceEnabled,
  setPaymentDisappearTraceEnabled,
  setPaymentTraceWatchTarget,
  subscribePaymentTrace,
} from '../../services/debug/paymentDisappearanceTrace';

const PaymentDisappearTracePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(isPaymentDisappearTraceEnabled);
  const [watchTxId, setWatchTxId] = useState(() => getPaymentTraceWatchTarget().transactionId ?? '');
  const [watchInvoiceId, setWatchInvoiceId] = useState(() => getPaymentTraceWatchTarget().invoiceId ?? '');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribePaymentTrace(() => setTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onToggleEnabled = useCallback(() => {
    const next = !enabled;
    setPaymentDisappearTraceEnabled(next);
    setEnabled(next);
  }, [enabled]);

  const onApplyWatch = useCallback(() => {
    setPaymentTraceWatchTarget({
      transactionId: watchTxId.trim() || undefined,
      invoiceId: watchInvoiceId.trim() || undefined,
    });
    setTick((n) => n + 1);
  }, [watchTxId, watchInvoiceId]);

  const onClearWatch = useCallback(() => {
    clearPaymentTraceWatchTarget();
    setWatchTxId('');
    setWatchInvoiceId('');
    setTick((n) => n + 1);
  }, []);

  const onCopy = useCallback(async () => {
    const text = formatPaymentTraceForExport(getPaymentTraceBuffer());
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Copy payment trace log:', text);
    }
  }, [tick]);

  if (!isStagingEnvironment()) return null;

  const entries = getPaymentTraceBuffer();
  const globalMode = enabled && !hasPaymentTraceWatchTarget();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-[9998] rounded-lg px-3 py-2 text-xs font-semibold shadow-lg border"
        style={{
          background: enabled ? '#1e3a5f' : '#4b5563',
          color: '#fff',
          borderColor: enabled ? '#60a5fa' : '#9ca3af',
        }}
        title="Payment sync trace (Ctrl+Shift+Alt+P)"
      >
        Payment trace{enabled ? (globalMode ? ' GLOBAL' : ' ON') : ''}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-labelledby="payment-trace-title"
        >
          <div
            className="flex flex-col w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl border border-gray-300 bg-white text-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 id="payment-trace-title" className="text-lg font-semibold">
                  Payment sync trace (global)
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  Staging only · Ctrl+Shift+Alt+P · tracks all transactions — no IDs required
                </p>
              </div>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800 text-xl leading-none px-2"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-2 px-4 py-3 border-b bg-gray-50">
              <button
                type="button"
                onClick={onToggleEnabled}
                className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
                  enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {enabled ? 'Stop tracing' : 'Start tracing'}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearPaymentTraceBuffer();
                  setTick((n) => n + 1);
                }}
                className="rounded px-3 py-1.5 text-sm border border-gray-300 bg-white hover:bg-gray-100"
              >
                Clear log
              </button>
              <button
                type="button"
                onClick={() => void onCopy()}
                className="rounded px-3 py-1.5 text-sm border border-gray-300 bg-white hover:bg-gray-100"
              >
                Copy log
              </button>
            </div>

            <div className="px-4 py-2 text-sm border-b bg-amber-50 text-amber-900">
              {enabled ? (
                <>
                  <strong>Global mode</strong> — logs every ADD / UPDATE / SET_STATE / refresh with{' '}
                  <strong>ADDED=[…]</strong> and <strong>REMOVED=[…]</strong>. Perform one invoice + payment
                  flow, then copy the log. Red lines = transactions removed from state or hidden in UI.
                </>
              ) : (
                <>Click <strong>Start tracing</strong>, then create invoice and receive payment (no watch IDs needed).</>
              )}
            </div>

            <details className="px-4 py-2 border-b bg-gray-50 text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                Optional: filter to one transaction ID
              </summary>
              <div className="flex flex-wrap gap-2 items-end mt-2">
                <label className="flex flex-col gap-0.5 text-xs text-gray-600">
                  Transaction ID
                  <input
                    type="text"
                    value={watchTxId}
                    onChange={(e) => setWatchTxId(e.target.value)}
                    placeholder="txn-bp-… or numeric id"
                    className="rounded border border-gray-300 px-2 py-1 text-sm font-mono w-72 max-w-full"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-gray-600">
                  Invoice / bill UUID
                  <input
                    type="text"
                    value={watchInvoiceId}
                    onChange={(e) => setWatchInvoiceId(e.target.value)}
                    placeholder="bill_… or invoice uuid"
                    className="rounded border border-gray-300 px-2 py-1 text-sm font-mono w-72 max-w-full"
                  />
                </label>
                <button
                  type="button"
                  onClick={onApplyWatch}
                  disabled={!enabled}
                  className="rounded px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
                >
                  Apply filter
                </button>
                <button
                  type="button"
                  onClick={onClearWatch}
                  disabled={!enabled}
                  className="rounded px-3 py-1.5 text-sm border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
                >
                  Clear filter (global)
                </button>
              </div>
            </details>

            <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed min-h-[200px]">
              {entries.length === 0 ? (
                <p className="text-gray-500">No trace events yet.</p>
              ) : (
                <ul className="space-y-2">
                  {[...entries].reverse().map((e, i) => {
                    const added = e.addedTransactionIds ?? (e.extra?.addedTransactionIds as string[] | undefined);
                    const addedSummaries = e.extra?.addedSummaries as string[] | undefined;
                    const removedSummaries = e.extra?.removedSummaries as string[] | undefined;
                    const hidden = e.extra?.hiddenPaymentIds as string[] | undefined;
                    const ledger = e.extra?.transactionSummaries as string[] | undefined;
                    return (
                      <li
                        key={`${e.ts}-${i}`}
                        className={`rounded border px-2 py-1.5 ${
                          e.level === 'warn' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="font-semibold text-gray-800">
                          {e.ts} · {e.site} · {e.detail}
                        </div>
                        <div className="text-gray-700 mt-0.5">
                          {e.transactionCount != null && <span>count={e.transactionCount} </span>}
                          {e.beforeCount != null && <span>before={e.beforeCount} </span>}
                          {e.afterCount != null && <span>after={e.afterCount} </span>}
                          {(e.transactionId ?? e.payloadTransactionId) && (
                            <span>tx={e.transactionId ?? e.payloadTransactionId} </span>
                          )}
                          {e.invoiceId && <span>inv={e.invoiceId} </span>}
                          {e.amount != null && <span>amt={e.amount} </span>}
                          {e.payloadTransactionVersion != null && <span>v={e.payloadTransactionVersion} </span>}
                        </div>
                        {added?.length ? (
                          <div className="text-green-800 mt-1 font-semibold">
                            ADDED=[{added.join(', ')}]
                          </div>
                        ) : null}
                        {addedSummaries?.map((s) => (
                          <div key={s} className="text-green-700 mt-0.5 pl-2">
                            + {s}
                          </div>
                        ))}
                        {e.removedTransactionIds?.length ? (
                          <div className="text-red-800 mt-1 font-bold">
                            REMOVED=[{e.removedTransactionIds.join(', ')}]
                          </div>
                        ) : null}
                        {removedSummaries?.map((s) => (
                          <div key={s} className="text-red-700 mt-0.5 pl-2">
                            - {s}
                          </div>
                        ))}
                        {hidden?.length ? (
                          <div className="text-orange-800 mt-1 font-bold">
                            UI_HIDDEN=[{hidden.join(', ')}]
                          </div>
                        ) : null}
                        {ledger?.length && e.site === 'trace-session' ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-gray-600">
                              Baseline ledger ({ledger.length} txs)
                            </summary>
                            <div className="pl-2 mt-1 text-gray-600 max-h-32 overflow-auto">
                              {ledger.map((line) => (
                                <div key={line}>{line}</div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PaymentDisappearTracePanel;
