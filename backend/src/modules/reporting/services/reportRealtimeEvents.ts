import { emitEntityEvent, type RealtimeAction } from '../../../core/realtime.js';

export function emitReportDefinitionEvent(
  tenantId: string,
  action: RealtimeAction,
  payload: { id: string; data?: unknown },
  sourceUserId?: string
): void {
  emitEntityEvent(tenantId, action, 'report_definition', {
    id: payload.id,
    data: payload.data ?? { id: payload.id },
    sourceUserId,
  });
}

export function emitCustomReportTemplateEvent(
  tenantId: string,
  action: RealtimeAction,
  payload: { id: string; data?: unknown },
  sourceUserId?: string
): void {
  emitEntityEvent(tenantId, action, 'custom_report_template', {
    id: payload.id,
    data: payload.data ?? { id: payload.id },
    sourceUserId,
  });
}
