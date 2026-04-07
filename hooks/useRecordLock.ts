import { useCallback, useEffect, useRef, useState } from 'react';
import { isLocalOnlyMode } from '../config/apiUrl';
import {
  acquireRecordLock,
  forceRecordLock,
  getRecordLockStatus,
  refreshRecordLock,
  releaseRecordLock,
  type RecordLockType,
} from '../services/api/recordLocksApi';
import { getRealtimeSocket } from '../core/socket';

const HEARTBEAT_MS = 30_000;
const POLL_MS = 10_000;

export function isAdminRole(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase().replace(/\s+/g, '_');
  return r === 'admin' || r === 'super_admin';
}

export type UseRecordLockOptions = {
  recordType: RecordLockType;
  recordId: string | undefined;
  enabled: boolean;
  currentUserId: string | undefined;
  currentUserName: string | undefined;
  userRole: string | undefined;
};

export type RecordLockUiState = {
  viewOnly: boolean;
  isEditing: boolean;
  lockedByName: string | null;
  lockedByUserId: string | null;
  isLoading: boolean;
  showConflictModal: boolean;
  bannerMode: 'self' | 'other' | null;
};

type HeldRef = { recordType: RecordLockType; recordId: string };

export function useRecordLock(opts: UseRecordLockOptions): RecordLockUiState & {
  dismissModal: () => void;
  chooseViewOnly: () => void;
  forceTakeover: () => Promise<void>;
  assertCanEdit: () => boolean;
} {
  const { recordType, recordId, enabled, currentUserId, userRole } = opts;
  const isAdmin = isAdminRole(userRole);

  const [viewOnly, setViewOnly] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const [lockedByName, setLockedByName] = useState<string | null>(null);
  const [lockedByUserId, setLockedByUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [holdLock, setHoldLock] = useState(false);

  const heldRef = useRef<HeldRef | null>(null);
  const mountedRef = useRef(true);

  const clearHeld = useCallback(() => {
    heldRef.current = null;
    setHoldLock(false);
  }, []);

  const setHeld = useCallback((rt: RecordLockType, rid: string) => {
    heldRef.current = { recordType: rt, recordId: rid };
    setHoldLock(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !recordId || isLocalOnlyMode()) {
      setViewOnly(false);
      setIsEditing(true);
      setLockedByName(null);
      setLockedByUserId(null);
      setShowConflictModal(false);
      clearHeld();
      return;
    }

    let cancelled = false;

    const releaseIfHeld = () => {
      const h = heldRef.current;
      if (h && !isLocalOnlyMode()) {
        void releaseRecordLock(h.recordType, h.recordId);
      }
      clearHeld();
    };

    void (async () => {
      setIsLoading(true);
      try {
        const res = await acquireRecordLock(recordType, recordId);
        if (cancelled || !mountedRef.current) return;
        if ('locked' in res && res.locked) {
          setLockedByName(res.lockedBy);
          setLockedByUserId(res.lockedByUserId ?? null);
          setViewOnly(true);
          setIsEditing(false);
          setShowConflictModal(true);
          clearHeld();
        } else {
          setHeld(recordType, recordId);
          setViewOnly(false);
          setIsEditing(true);
          setLockedByName(opts.currentUserName ?? null);
          setLockedByUserId(currentUserId ?? null);
          setShowConflictModal(false);
        }
      } catch {
        if (!mountedRef.current) return;
        clearHeld();
        setViewOnly(false);
        setIsEditing(true);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      releaseIfHeld();
    };
  }, [enabled, recordId, recordType, currentUserId, opts.currentUserName, clearHeld, setHeld]);

  useEffect(() => {
    if (!holdLock || !recordId || isLocalOnlyMode()) return;
    const t = window.setInterval(() => {
      void refreshRecordLock(recordType, recordId).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [holdLock, recordId, recordType]);

  useEffect(() => {
    if (!enabled || !recordId || isLocalOnlyMode()) return;
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const st = await getRecordLockStatus(recordType, recordId);
          if (!mountedRef.current || !('locked' in st)) return;
          if (!st.locked) {
            if (viewOnly && !holdLock) {
              setLockedByName(null);
              setLockedByUserId(null);
            }
            return;
          }
          if (st.locked && 'lockedBy' in st) {
            setLockedByName(st.lockedBy);
            setLockedByUserId(st.lockedByUserId);
            if (currentUserId && st.lockedByUserId !== currentUserId) {
              setViewOnly(true);
              setIsEditing(false);
            }
            if (currentUserId && st.lockedByUserId === currentUserId) {
              setViewOnly(false);
              setIsEditing(true);
            }
          }
        } catch {
          /* ignore */
        }
      })();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, recordId, recordType, viewOnly, holdLock, currentUserId]);

  useEffect(() => {
    if (!enabled || !recordId || isLocalOnlyMode()) return;
    const socket = getRealtimeSocket();
    if (!socket) return;
    const onAcquired = (payload: {
      recordType?: string;
      recordId?: string;
      lockedBy?: string;
      lockedByUserId?: string;
    }) => {
      if (payload.recordType !== recordType || payload.recordId !== recordId) return;
      setLockedByName(payload.lockedBy ?? null);
      setLockedByUserId(payload.lockedByUserId ?? null);
      if (payload.lockedByUserId && currentUserId && payload.lockedByUserId === currentUserId) {
        setViewOnly(false);
        setIsEditing(true);
      } else if (payload.lockedByUserId && currentUserId && payload.lockedByUserId !== currentUserId) {
        setViewOnly(true);
        setIsEditing(false);
      }
    };
    const onReleased = (payload: { recordType?: string; recordId?: string }) => {
      if (payload.recordType !== recordType || payload.recordId !== recordId) return;
      void getRecordLockStatus(recordType, recordId).then((st) => {
        if (!mountedRef.current || !('locked' in st)) return;
        if (!st.locked) {
          setLockedByName(null);
          setLockedByUserId(null);
        } else if (st.locked && 'lockedBy' in st) {
          setLockedByName(st.lockedBy);
          setLockedByUserId(st.lockedByUserId);
        }
      });
    };
    socket.on('lock_acquired', onAcquired);
    socket.on('lock_released', onReleased);
    return () => {
      socket.off('lock_acquired', onAcquired);
      socket.off('lock_released', onReleased);
    };
  }, [enabled, recordId, recordType, currentUserId]);

  const dismissModal = useCallback(() => setShowConflictModal(false), []);
  const chooseViewOnly = useCallback(() => {
    setShowConflictModal(false);
    setViewOnly(true);
    setIsEditing(false);
  }, []);

  const forceTakeover = useCallback(async () => {
    if (!recordId || !isAdmin) return;
    try {
      await forceRecordLock(recordType, recordId);
      if (!mountedRef.current) return;
      setHeld(recordType, recordId);
      setViewOnly(false);
      setIsEditing(true);
      setShowConflictModal(false);
      setLockedByName(opts.currentUserName ?? null);
      setLockedByUserId(currentUserId ?? null);
    } catch {
      /* 403 / network */
    }
  }, [recordId, isAdmin, recordType, currentUserId, opts.currentUserName, setHeld]);

  const assertCanEdit = useCallback(() => !viewOnly && isEditing, [viewOnly, isEditing]);

  let bannerMode: 'self' | 'other' | null = null;
  if (enabled && recordId && !isLocalOnlyMode()) {
    if (holdLock && !viewOnly) bannerMode = 'self';
    else if (viewOnly && lockedByName) bannerMode = 'other';
  }

  return {
    viewOnly,
    isEditing,
    lockedByName,
    lockedByUserId,
    isLoading,
    showConflictModal,
    bannerMode,
    dismissModal,
    chooseViewOnly,
    forceTakeover,
    assertCanEdit,
  };
}
