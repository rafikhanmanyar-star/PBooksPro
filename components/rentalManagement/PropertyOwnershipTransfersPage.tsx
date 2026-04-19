import React, { useCallback, useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import type { AppAction, PropertyOwnership } from '../../types';
import { ContactType } from '../../types';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { formatApiErrorMessage } from '../../services/api/client';
import {
  applyOwnershipTransferToState,
  OWNERSHIP_TOTAL_EPS,
  redistributeCoOwnerPercentages,
  type CoOwnerFormRow,
} from '../../services/propertyOwnershipService';
import { getCurrentTenantId } from '../../services/database/tenantUtils';
import { toLocalDateString } from '../../utils/dateUtils';

type RowDisplay = PropertyOwnership & {
  propertyName?: string;
  ownerName?: string;
};

function sortSegmentsDesc(rows: PropertyOwnership[]): PropertyOwnership[] {
  return [...rows].sort((a, b) => {
    const c = (b.startDate || '').localeCompare(a.startDate || '');
    if (c !== 0) return c;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}

const PropertyOwnershipTransfersPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showAlert, showConfirm } = useNotification();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'Admin' || state.currentUser?.role === 'Admin';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [transferDate, setTransferDate] = useState(toLocalDateString(new Date()));
  const [transferDocument, setTransferDocument] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<CoOwnerFormRow[]>([{ ownerId: '', percentage: '' }]);
  const [loading, setLoading] = useState(false);

  const owners = useMemo(
    () => state.contacts.filter((c) => c.type === ContactType.OWNER || c.type === ContactType.CLIENT),
    [state.contacts]
  );

  const propertyItems = useMemo(
    () => state.properties.map((p) => ({ id: p.id, name: p.name })),
    [state.properties]
  );

  const displayRows: RowDisplay[] = useMemo(() => {
    const base = (state.propertyOwnership || []).filter((r) => !r.deletedAt);
    const sorted = sortSegmentsDesc(base);
    return sorted.map((r) => ({
      ...r,
      propertyName: state.properties.find((p) => p.id === r.propertyId)?.name,
      ownerName: state.contacts.find((c) => c.id === r.ownerId)?.name,
    }));
  }, [state.propertyOwnership, state.properties, state.contacts]);

  const selected = useMemo(
    () => (selectedId ? displayRows.find((r) => r.id === selectedId) : undefined),
    [selectedId, displayRows]
  );

  const totalPct = useMemo(
    () => rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0),
    [rows]
  );

  const refreshFromApi = useCallback(async () => {
    if (isLocalOnlyMode() || !isAuthenticated) return;
    setLoading(true);
    try {
      const api = getAppStateApiService();
      const partial = await api.loadState();
      dispatch({
        type: 'SET_STATE',
        payload: {
          properties: partial.properties,
          propertyOwnership: partial.propertyOwnership,
        },
        _isRemote: true,
      } as AppAction);
    } catch (e) {
      await showAlert(formatApiErrorMessage(e) || 'Could not refresh.');
    } finally {
      setLoading(false);
    }
  }, [dispatch, isAuthenticated, showAlert]);

  const handlePctChange = useCallback((idx: number, raw: string) => {
    setRows((prev) => redistributeCoOwnerPercentages(prev, idx, raw));
  }, []);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) {
      await showAlert('Select a property.');
      return;
    }
    const newOwners = rows
      .filter((r) => r.ownerId && String(r.percentage).trim() !== '')
      .map((r) => ({
        ownerId: r.ownerId,
        percentage: parseFloat(r.percentage) || 0,
      }));
    if (newOwners.length === 0) {
      await showAlert('Add at least one owner with a percentage.');
      return;
    }
    if (Math.abs(totalPct - 100) > OWNERSHIP_TOTAL_EPS) {
      await showAlert(`Percentages must total 100% (currently ${totalPct.toFixed(2)}%).`);
      return;
    }
    const useApi = !isLocalOnlyMode() && isAuthenticated;
    try {
      if (useApi) {
        const api = getAppStateApiService();
        await api.transferPropertyOwnership(propertyId, {
          transferDate: transferDate.slice(0, 10),
          owners: newOwners.map((o) => ({ ownerId: o.ownerId, sharePercent: o.percentage })),
          transferDocument: transferDocument.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        await refreshFromApi();
      } else {
        const next = applyOwnershipTransferToState(state, {
          propertyId,
          transferDate: transferDate.slice(0, 10),
          newOwners,
          transferReference: transferDocument.trim() || undefined,
          notes: notes.trim() || undefined,
          tenantId: getCurrentTenantId(),
        });
        dispatch({
          type: 'SET_STATE',
          payload: {
            properties: next.properties,
            propertyOwnership: next.propertyOwnership,
            propertyOwnershipHistory: next.propertyOwnershipHistory,
          },
        });
      }
      setShowCreate(false);
      setPropertyId('');
      setTransferDocument('');
      setNotes('');
      setRows([{ ownerId: '', percentage: '' }]);
    } catch (err) {
      await showAlert(formatApiErrorMessage(err) || 'Transfer failed.');
    }
  };

  const handleSoftDeleteSegment = async () => {
    if (!selected || !isAdmin) return;
    if (!(await showConfirm('Soft-delete this ownership segment? Corrections only — data stays in the database.', { title: 'Delete segment' }))) return;
    const useApi = !isLocalOnlyMode() && isAuthenticated;
    try {
      if (useApi) {
        const api = getAppStateApiService();
        await api.softDeleteOwnershipSegment(selected.id);
        await refreshFromApi();
      } else {
        const updated = (state.propertyOwnership || []).map((r) =>
          r.id === selected.id ? { ...r, deletedAt: new Date().toISOString() } : r
        );
        dispatch({ type: 'SET_STATE', payload: { propertyOwnership: updated } });
      }
      setSelectedId(null);
    } catch (err) {
      await showAlert(formatApiErrorMessage(err) || 'Could not delete.');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-app-text">Ownership transfers</h1>
          <p className="text-sm text-app-muted">
            Property-level ownership history (percentages). Current owners have no end date and are active.
          </p>
        </div>
        <div className="flex gap-2">
          {!isLocalOnlyMode() && isAuthenticated && (
            <Button type="button" variant="secondary" onClick={() => void refreshFromApi()} disabled={loading}>
              Refresh from server
            </Button>
          )}
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'New transfer'}
          </Button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => void submitCreate(e)}
          className="border border-app-border rounded-lg p-4 bg-app-toolbar/20 space-y-3 shrink-0"
        >
          <h2 className="text-sm font-semibold">Create transfer</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ComboBox
              label="Property"
              items={propertyItems}
              selectedId={propertyId}
              onSelect={(item) => setPropertyId(item?.id || '')}
              placeholder="Select property"
            />
            <div>
              <label className="block text-xs font-medium text-app-muted mb-1">Transfer date</label>
              <DatePicker value={transferDate} onChange={(d) => setTransferDate(toLocalDateString(d))} />
            </div>
            <Input
              label="Document reference (optional)"
              value={transferDocument}
              onChange={(e) => setTransferDocument(e.target.value)}
            />
            <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <ComboBox
                label={`Owner ${idx + 1}`}
                items={owners}
                selectedId={row.ownerId}
                onSelect={(item) => {
                  const next = [...rows];
                  next[idx] = { ...next[idx], ownerId: item?.id || '' };
                  setRows(next);
                }}
                placeholder="Select owner"
              />
              <Input
                label="%"
                type="text"
                inputMode="decimal"
                value={row.percentage}
                onChange={(e) => handlePctChange(idx, e.target.value)}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows((r) => [...r, { ownerId: '', percentage: '' }])}
            >
              Add owner
            </Button>
            <span className="text-sm text-app-muted">Total: {totalPct.toFixed(2)}%</span>
            <Button type="submit">Submit transfer</Button>
          </div>
        </form>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-app-border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="overflow-auto flex-1">
            <table className="min-w-full text-sm">
              <thead className="bg-app-toolbar sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Property</th>
                  <th className="text-left p-2 font-medium">Owner</th>
                  <th className="text-left p-2 font-medium">Start</th>
                  <th className="text-left p-2 font-medium">End</th>
                  <th className="text-right p-2 font-medium">%</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer border-t border-app-border ${selectedId === r.id ? 'bg-primary/10' : 'hover:bg-app-toolbar/40'}`}
                  >
                    <td className="p-2">{r.propertyName || r.propertyId}</td>
                    <td className="p-2">{r.ownerName || r.ownerId}</td>
                    <td className="p-2">{r.startDate?.slice(0, 10)}</td>
                    <td className="p-2">{r.endDate ? r.endDate.slice(0, 10) : '—'}</td>
                    <td className="p-2 text-right">{r.ownershipPercentage}</td>
                    <td className="p-2 max-w-[200px] truncate" title={r.notes}>
                      {r.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayRows.length === 0 && (
              <div className="p-8 text-center text-app-muted">No ownership segments yet.</div>
            )}
          </div>
        </div>

        <div className="border border-app-border rounded-lg p-4 overflow-auto">
          <h2 className="text-sm font-semibold mb-2">Segment detail</h2>
          {!selected && <p className="text-sm text-app-muted">Select a row.</p>}
          {selected && (
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-app-muted text-xs">Property</div>
                <div>{selected.propertyName || selected.propertyId}</div>
              </div>
              <div>
                <div className="text-app-muted text-xs">Owner</div>
                <div>{selected.ownerName || selected.ownerId}</div>
              </div>
              <div>
                <div className="text-app-muted text-xs">Share %</div>
                <div>{selected.ownershipPercentage}</div>
              </div>
              <div>
                <div className="text-app-muted text-xs">Start / end</div>
                <div>
                  {selected.startDate?.slice(0, 10)} → {selected.endDate ? selected.endDate.slice(0, 10) : 'current'}
                </div>
              </div>
              <div>
                <div className="text-app-muted text-xs">Document</div>
                <div>{selected.transferDocument || '—'}</div>
              </div>
              <div>
                <div className="text-app-muted text-xs">Notes</div>
                <div className="whitespace-pre-wrap">{selected.notes || '—'}</div>
              </div>
              {isAdmin && (
                <Button type="button" variant="secondary" className="mt-4" onClick={() => void handleSoftDeleteSegment()}>
                  Soft-delete segment
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyOwnershipTransfersPage;
