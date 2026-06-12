-- One-time: reset users stuck on full_erp back to auto after executive mobile launch.
-- "Open full ERP" previously persisted full_erp server-side; auto restores executive
-- mobile on phones while desktop users keep full ERP via auto-detection.

UPDATE users
SET interface_mode = 'auto',
    updated_at = NOW()
WHERE interface_mode = 'full_erp';
