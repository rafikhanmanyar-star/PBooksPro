-- DROP TASKS SCHEMA
-- WARNING: This migration DROPS data. Run manually on staging first. Do NOT add to auto-run.
-- Run only when intentionally removing the Tasks module.

-- Drop in dependency order (child tables first)
DROP TABLE IF EXISTS task_role_permissions CASCADE;
DROP TABLE IF EXISTS task_user_roles CASCADE;
DROP TABLE IF EXISTS task_okr_updates CASCADE;
DROP TABLE IF EXISTS task_key_results CASCADE;
DROP TABLE IF EXISTS task_objectives CASCADE;
DROP TABLE IF EXISTS task_milestones CASCADE;
DROP TABLE IF EXISTS task_items CASCADE;
DROP TABLE IF EXISTS task_initiatives CASCADE;
DROP TABLE IF EXISTS task_updates CASCADE;
DROP TABLE IF EXISTS task_performance_scores CASCADE;
DROP TABLE IF EXISTS task_performance_config CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

-- Optional: drop other task_* tables if they exist
DROP TABLE IF EXISTS task_roles CASCADE;
DROP TABLE IF EXISTS task_permissions CASCADE;
DROP TABLE IF EXISTS task_notification_preferences CASCADE;
DROP TABLE IF EXISTS task_notifications CASCADE;
DROP TABLE IF EXISTS task_periods CASCADE;
