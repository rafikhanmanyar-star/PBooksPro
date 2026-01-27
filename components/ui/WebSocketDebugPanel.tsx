import React, { useEffect, useMemo, useState } from 'react';
import { getWebSocketClient, WebSocketDebugState } from '../../services/websocketClient';
import { apiClient } from '../../services/api/client';

const REFRESH_MS = 500;
const MAX_EVENT_CHARS = 600;

const toStatusColor = (status: WebSocketDebugState['status']) => {
  switch (status) {
    case 'connected':
      return 'text-green-600';
    case 'connecting':
      return 'text-amber-600';
    case 'error':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
};

const safeStringify = (value: any) => {
  try {
    const text = JSON.stringify(value);
    if (text.length <= MAX_EVENT_CHARS) return text;
    return `${text.slice(0, MAX_EVENT_CHARS)}...`;
  } catch {
    return '[unserializable]';
  }
};

const WebSocketDebugPanel: React.FC = () => {
  const enabled = useMemo(() => {
    const flag = import.meta.env.VITE_WS_DEBUG;
    return flag === 'true' || import.meta.env.DEV;
  }, []);

  const [expanded, setExpanded] = useState(true);
  const [snapshot, setSnapshot] = useState<WebSocketDebugState>(() => getWebSocketClient().getDebugState());

  useEffect(() => {
    if (!enabled) return;
    const ws = getWebSocketClient();
    const timer = setInterval(() => {
      setSnapshot(ws.getDebugState());
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;

  const authTenantId = apiClient.getTenantId();
  const lastEventText = snapshot.lastEvent ? safeStringify(snapshot.lastEvent.data) : '—';

  return (
    <div className="fixed bottom-20 left-4 z-50 max-w-sm">
      <div className="bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 text-xs text-gray-800">
        <div className="flex items-center justify-between">
          <span className="font-semibold">WebSocket Debug</span>
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Toggle WebSocket debug panel"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>

        {expanded && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className={`font-semibold ${toStatusColor(snapshot.status)}`}>
                {snapshot.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Server</span>
              <span className="truncate max-w-[200px]" title={snapshot.serverUrl}>
                {snapshot.serverUrl}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tenant</span>
              <span className="truncate max-w-[200px]">
                {snapshot.tenantId || authTenantId || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last status</span>
              <span>{snapshot.lastStatusAt || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last event</span>
              <span className="truncate max-w-[200px]">
                {snapshot.lastEvent?.type || '—'}
              </span>
            </div>
            <div className="pt-1 text-[11px] text-gray-600 break-words">
              {lastEventText}
            </div>
            {snapshot.lastError && (
              <div className="text-[11px] text-red-600 break-words">
                {snapshot.lastError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WebSocketDebugPanel;
