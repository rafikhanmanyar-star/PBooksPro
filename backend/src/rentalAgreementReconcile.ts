/** Same rules as services/rentalAgreementReconcile.ts (LAN API; no dependency on frontend types). */

const ACTIVE = 'Active';
const RENEWED = 'Renewed';
const TERMINATED = 'Terminated';

const CHAIN = new Set([ACTIVE, RENEWED]);

export type ReconcileRentalAgreementLike = {
  id: string;
  propertyId: string;
  contactId: string;
  startDate: string;
  endDate: string;
  status: string;
  brokerFee?: number;
  previousAgreementId?: string;
};

function ymdKey(iso: string | undefined): string {
  if (!iso) return '';
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function compareAgreements(a: ReconcileRentalAgreementLike, b: ReconcileRentalAgreementLike): number {
  const c = ymdKey(a.startDate).localeCompare(ymdKey(b.startDate));
  if (c !== 0) return c;
  const d = ymdKey(a.endDate).localeCompare(ymdKey(b.endDate));
  if (d !== 0) return d;
  return String(a.id).localeCompare(String(b.id));
}

export function reconcileRentalAgreementsListLike<T extends ReconcileRentalAgreementLike>(agreements: T[]): T[] {
  if (!agreements.length) return agreements;

  const byId = new Map<string, T>();
  for (const a of agreements) {
    byId.set(a.id, { ...a });
  }

  const byPropContact = new Map<string, string[]>();
  for (const id of byId.keys()) {
    const a = byId.get(id)!;
    const key = `${a.propertyId}\0${a.contactId}`;
    if (!byPropContact.has(key)) byPropContact.set(key, []);
    byPropContact.get(key)!.push(id);
  }

  for (const ids of byPropContact.values()) {
    const chain = ids
      .map((id) => byId.get(id)!)
      .filter((a) => CHAIN.has(a.status))
      .sort(compareAgreements);

    const n = chain.length;
    if (n === 0) continue;

    const maxFee = chain.reduce((m, a) => Math.max(m, a.brokerFee ?? 0), 0);

    for (let i = 0; i < n; i++) {
      const cur = chain[i];
      const prev = byId.get(cur.id)!;
      const prevAgreementId = i > 0 ? chain[i - 1].id : undefined;
      // Do not promote a lone "Renewed" row to Active: that breaks renewal when only the old
      // agreement exists in the set (e.g. client marked it Renewed before the successor row
      // was saved, or server reconcile ran after PUT but before POST). Last-in-chain = Active
      // only applies when there are multiple links in the renewal chain.
      const status =
        n === 1 ? (prev.status === RENEWED ? RENEWED : ACTIVE) : i === n - 1 ? ACTIVE : RENEWED;
      const brokerFee = i === 0 ? maxFee : 0;

      if (
        prev.status !== status ||
        (prev.previousAgreementId ?? '') !== (prevAgreementId ?? '') ||
        (prev.brokerFee ?? 0) !== brokerFee
      ) {
        byId.set(cur.id, { ...prev, status, previousAgreementId: prevAgreementId, brokerFee } as T);
      }
    }
  }

  const byProperty = new Map<string, string[]>();
  for (const id of byId.keys()) {
    const a = byId.get(id)!;
    if (!byProperty.has(a.propertyId)) byProperty.set(a.propertyId, []);
    byProperty.get(a.propertyId)!.push(id);
  }

  for (const ids of byProperty.values()) {
    const activeIds = ids.filter((id) => byId.get(id)!.status === ACTIVE);
    if (activeIds.length <= 1) continue;

    const actives = activeIds.map((id) => byId.get(id)!).sort((a, b) => {
      const c = ymdKey(b.endDate).localeCompare(ymdKey(a.endDate));
      if (c !== 0) return c;
      const d = ymdKey(b.startDate).localeCompare(ymdKey(a.startDate));
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });

    const winner = actives[0];
    for (const loser of actives.slice(1)) {
      const row = byId.get(loser.id)!;
      const newStatus = row.contactId === winner.contactId ? RENEWED : TERMINATED;
      if (row.status !== newStatus) {
        byId.set(loser.id, { ...row, status: newStatus } as T);
      }
    }
  }

  return agreements.map((a) => byId.get(a.id) ?? a);
}

export function reconcileChangedLike<T extends ReconcileRentalAgreementLike>(before: T[], after: T[]): boolean {
  if (before.length !== after.length) return true;
  const map = new Map(after.map((a) => [a.id, a]));
  for (const b of before) {
    const a = map.get(b.id);
    if (!a) return true;
    if (a.status !== b.status) return true;
    if ((a.previousAgreementId ?? '') !== (b.previousAgreementId ?? '')) return true;
    if (Math.abs((a.brokerFee ?? 0) - (b.brokerFee ?? 0)) > 0.005) return true;
  }
  return false;
}
