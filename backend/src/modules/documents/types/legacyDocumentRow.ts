/** Legacy `documents` table row shape — backfill script only (Phase 2). */
export type LegacyDocumentRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  entity_id: string;
  entity_type: string;
  file_data: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  uploaded_at: Date;
  uploaded_by: string | null;
};
