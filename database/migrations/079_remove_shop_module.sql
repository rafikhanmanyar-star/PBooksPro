-- Remove deprecated shop/POS module from subscription plan features.
UPDATE billing_plans
SET features_json = jsonb_set(
  features_json,
  '{modules}',
  (
    SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    FROM jsonb_array_elements_text(COALESCE(features_json->'modules', '[]'::jsonb)) AS t(m)
    WHERE m <> 'shop'
  )
)
WHERE features_json->'modules' ? 'shop';
