-- Remove deprecated shop/POS module rows from tenant module licenses.
DELETE FROM tenant_modules WHERE module_key = 'shop';
