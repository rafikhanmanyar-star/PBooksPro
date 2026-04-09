-- Per-user calendar display timezone (IANA id, e.g. Asia/Karachi), or NULL = use device local time.
-- Survives logout; loaded on login.

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_timezone TEXT;
