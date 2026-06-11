export type DocumentEntityType =
  | 'agreement'
  | 'cnic'
  | 'receipt'
  | 'vendor_bill'
  | 'payment_proof'
  | 'quotation'
  | 'other';

export type DocumentMetadataRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string | null;
  file_name: string;
  storage_key: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
};
