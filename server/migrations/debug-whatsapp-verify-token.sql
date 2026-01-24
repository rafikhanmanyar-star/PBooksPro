-- =====================================================
-- WhatsApp Verify Token Debugging Queries
-- Run these in DBeaver to diagnose verify token issues
-- =====================================================

-- 1. Check all WhatsApp configurations
SELECT 
    id,
    tenant_id,
    verify_token,
    phone_number_id,
    is_active,
    created_at,
    updated_at
FROM whatsapp_configs
ORDER BY created_at DESC;

-- 2. Check only active configurations
SELECT 
    tenant_id,
    verify_token,
    phone_number_id,
    is_active
FROM whatsapp_configs
WHERE is_active = TRUE;

-- 3. Check verify token length and preview (first 30 chars)
SELECT 
    tenant_id,
    LENGTH(verify_token) as token_length,
    LEFT(verify_token, 30) || '...' as token_preview,
    verify_token as full_token
FROM whatsapp_configs
WHERE is_active = TRUE;

-- 4. Check for duplicate active configs (should be only one per tenant)
SELECT 
    tenant_id,
    COUNT(*) as config_count
FROM whatsapp_configs
WHERE is_active = TRUE
GROUP BY tenant_id
HAVING COUNT(*) > 1;

-- 5. Find configs with specific verify token (replace YOUR_TOKEN)
-- SELECT * FROM whatsapp_configs WHERE verify_token = 'YOUR_TOKEN';

-- =====================================================
-- Fix Queries (Use with caution!)
-- =====================================================

-- Update verify token for a specific tenant
-- Replace YOUR_TENANT_ID and YOUR_NEW_VERIFY_TOKEN
/*
UPDATE whatsapp_configs
SET verify_token = 'YOUR_NEW_VERIFY_TOKEN',
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND is_active = TRUE;
*/

-- Deactivate all configs (if you have multiple active)
/*
UPDATE whatsapp_configs 
SET is_active = FALSE 
WHERE is_active = TRUE;
*/

-- Activate a specific config
-- Replace YOUR_TENANT_ID
/*
UPDATE whatsapp_configs 
SET is_active = TRUE,
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID';
*/

-- Delete all WhatsApp configs (nuclear option - use with caution!)
/*
DELETE FROM whatsapp_configs;
*/
