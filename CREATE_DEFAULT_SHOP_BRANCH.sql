/*******************************************************************************
 * PBooksPro - CREATE DEFAULT SHOP BRANCH & TERMINAL
 * 
 * Description: Creates a default branch and terminal for POS operations
 * Tool: Run this in DBeaver or any SQL client connected to your database
 * 
 * NOTE: This will automatically use the first tenant in your database
 ******************************************************************************/

-- First, let's see what tenants exist
SELECT id, organization_name, created_at FROM tenants ORDER BY created_at LIMIT 5;

-- Now create the default branch and terminal using the first tenant
DO $$
DECLARE
    v_tenant_id TEXT;
BEGIN
    -- Get the first tenant ID
    SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'No tenant found in the database. Please create a tenant first.';
    END IF;
    
    RAISE NOTICE 'Using tenant_id: %', v_tenant_id;
    
    -- Create a default branch for POS operations
    INSERT INTO shop_branches (
        id,
        tenant_id,
        name,
        code,
        type,
        status,
        location,
        region,
        timezone,
        created_at,
        updated_at
    ) VALUES (
        'default-branch',
        v_tenant_id,
        'Main Store',
        'MAIN',
        'Flagship',
        'Active',
        'Main Location',
        'Default Region',
        'GMT+5',
        NOW(),
        NOW()
    ) ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW();
    
    RAISE NOTICE 'Created/Updated branch: default-branch';
    
    -- Create a default terminal for the default branch
    INSERT INTO shop_terminals (
        id,
        tenant_id,
        branch_id,
        name,
        code,
        status,
        created_at,
        updated_at
    ) VALUES (
        'default-terminal',
        v_tenant_id,
        'default-branch',
        'Terminal 1',
        'T1',
        'Online',
        NOW(),
        NOW()
    ) ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        branch_id = EXCLUDED.branch_id,
        updated_at = NOW();
    
    RAISE NOTICE 'Created/Updated terminal: default-terminal';
    
END $$;

-- Verify the creation
SELECT 
    'Branch' as type,
    id, 
    tenant_id, 
    name, 
    code, 
    status 
FROM shop_branches 
WHERE code = 'MAIN'

UNION ALL

SELECT 
    'Terminal' as type,
    id, 
    tenant_id, 
    name, 
    code, 
    status 
FROM shop_terminals 
WHERE code = 'T1';
