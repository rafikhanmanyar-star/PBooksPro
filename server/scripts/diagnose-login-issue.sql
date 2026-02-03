-- =====================================================
-- Diagnose Login Issue After Registration
-- =====================================================
-- 
-- Run this script to check why login is failing after registration
-- Replace 'YOUR_EMAIL' and 'YOUR_USERNAME' with actual values
-- =====================================================

-- Step 1: Check if tenant exists (by email)
-- Replace 'YOUR_EMAIL' with the organization email used during registration
SELECT 
    id,
    name,
    company_name,
    email,
    LOWER(TRIM(email)) as normalized_email,
    license_status,
    is_supplier,
    created_at
FROM tenants 
WHERE LOWER(TRIM(email)) = LOWER(TRIM('YOUR_EMAIL'));

-- Step 2: If tenant found, check users for that tenant
-- Replace 'YOUR_TENANT_ID' with the tenant ID from Step 1
-- Replace 'YOUR_USERNAME' with the username used during registration
SELECT 
    id,
    tenant_id,
    username,
    LOWER(TRIM(username)) as normalized_username,
    email,
    LOWER(TRIM(email)) as normalized_email,
    role,
    is_active,
    LENGTH(password) as password_length,
    LEFT(password, 7) as password_prefix,
    created_at
FROM users 
WHERE tenant_id = 'YOUR_TENANT_ID'
  AND (
    LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'))
    OR LOWER(TRIM(email)) = LOWER(TRIM('YOUR_USERNAME'))
  );

-- Step 3: Check all users for the tenant (to see what was actually created)
-- Replace 'YOUR_TENANT_ID' with the tenant ID from Step 1
SELECT 
    id,
    username,
    email,
    role,
    is_active,
    LENGTH(password) as password_length,
    LEFT(password, 7) as password_prefix,
    created_at
FROM users 
WHERE tenant_id = 'YOUR_TENANT_ID'
ORDER BY created_at DESC;

-- Step 4: Verify tenant email matches what you're using for login
-- This shows all tenants and their emails (for comparison)
SELECT 
    id,
    name,
    company_name,
    email,
    LOWER(TRIM(email)) as normalized_email,
    license_status,
    created_at
FROM tenants 
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- Common Issues to Check
-- =====================================================

-- Issue 1: Tenant email has extra spaces or different case
-- Check: Compare the email in tenants table with what you're entering

-- Issue 2: Username has extra spaces or different case
-- Check: Compare the username in users table with what you're entering

-- Issue 3: User email doesn't match tenant email
-- Check: The user's email should match the tenant email (or be the username)

-- Issue 4: Password hash is wrong
-- Check: password_length should be 60, password_prefix should be $2a$10$

-- Issue 5: User is_active is FALSE
-- Check: is_active should be TRUE (or NULL)

-- =====================================================
-- Quick Fix: Reset User Password
-- =====================================================
-- If password is the issue, uncomment and run this:
/*
UPDATE users
SET 
    password = '$2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy',  -- admin123
    is_active = TRUE,
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));
*/

-- =====================================================
-- Quick Fix: Fix User Email to Match Tenant Email
-- =====================================================
-- If email mismatch is the issue, uncomment and run this:
/*
UPDATE users
SET 
    email = (SELECT email FROM tenants WHERE id = 'YOUR_TENANT_ID'),
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));
*/
