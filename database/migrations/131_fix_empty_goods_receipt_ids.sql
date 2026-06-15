-- Draft GRNs created before upsert id fix were stored with id = '' (client sent empty string).
-- They cannot be posted (POST /goods-receipts//post). Remove drafts only; lines cascade on delete.

DELETE FROM goods_receipts
WHERE id = '' AND status = 'Draft' AND deleted_at IS NULL;
