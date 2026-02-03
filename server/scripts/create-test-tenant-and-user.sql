-- =====================================================
-- Create Test Tenant and User - SQL Script for DBeaver
-- =====================================================
-- 
-- Use this script to create a test tenant and user
-- so you can login to the regular user portal
--
-- After running this, you can login with:
--   Organization Email: test@company.com
--   Username: admin
--   Password: admin123
-- =====================================================

-- Step 1: Create Test Tenant
INSERT INTO tenants (
    id,
    name,
    company_name,
    email,
    phone,
    address,
    is_active,
    trial_ends_at,
    created_at,
    updated_at
)
VALUES (
    'tenant_test_1',
    'Test Company',
    'Test Company Inc.',
    'test@company.com',
    '+1234567890',
    '123 Test Street, Test City',
    TRUE,
    NOW() + INTERVAL '30 days',  -- 30-day trial
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    company_name = EXCLUDED.company_name,
    email = EXCLUDED.email,
    is_active = TRUE,
    updated_at = NOW();

-- Step 2: Create Test User (Admin role) for the Tenant
-- Password: admin123
-- Bcrypt hash (10 rounds): $2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy

INSERT INTO users (
    id,
    tenant_id,
    username,
    name,
    email,
    password,
    role,
    is_active,
    created_at,
    updated_at
)
VALUES (
    'user_test_1',
    'tenant_test_1',
    'admin',
    'Test Admin User',
    'admin@testcompany.com',
    '$2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy',  -- admin123
    'admin',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    username = EXCLUDED.username,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    is_active = TRUE,
    updated_at = NOW();

-- Step 3: Verify the tenant and user were created
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    t.email as tenant_email,
    t.is_active as tenant_active,
    u.id as user_id,
    u.username,
    u.name as user_name,
    u.email as user_email,
    u.role,
    u.is_active as user_active
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
WHERE t.id = 'tenant_test_1';

-- Expected result:
-- tenant_id: tenant_test_1
-- tenant_name: Test Company
-- tenant_email: test@company.com
-- tenant_active: TRUE
-- user_id: user_test_1
-- username: admin
-- user_name: Test Admin User
-- user_email: admin@testcompany.com
-- role: admin
-- user_active: TRUE

-- =====================================================
-- Login Credentials for Regular User Portal
-- =====================================================
-- 
-- Organization Email: test@company.com
-- Username: admin
-- Password: admin123
-- 
-- Use these credentials on the CloudLoginPage
-- =====================================================
