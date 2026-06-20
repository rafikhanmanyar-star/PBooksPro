import { useCallback, useEffect, useState } from 'react';
import { breakGlassApi, type BreakGlassStatus, isBreakGlassUiEnabled } from '../services/api/breakGlassApi';
import { apiClient } from '../services/api/client';

const POLL_MS = 30_000;

export function useBreakGlassSession(enabled = isBreakGlassUiEnabled()) {
  const [status, setStatus] = useState<BreakGlassStatus>({ active: false });
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled || !apiClient.getToken()) {
      setStatus({ active: false });
      setLoading(false);
      return;
    }
    try {
      const next = await breakGlassApi.status();
      setStatus(next);
    } catch {
      setStatus({ active: false });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return undefined;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  const deactivate = useCallback(async () => {
    await breakGlassApi.deactivate();
    await refresh();
  }, [refresh]);

  return { status, loading, refresh, deactivate, enabled };
}
