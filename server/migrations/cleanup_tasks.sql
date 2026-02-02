-- Cleanup Task Management System Schema
-- Drop tables for tasks, task updates, performance scores, and performance config

DROP TABLE IF EXISTS task_performance_config CASCADE;
DROP TABLE IF EXISTS task_performance_scores CASCADE;
DROP TABLE IF EXISTS task_updates CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
