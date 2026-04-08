-- Personal tasks (per-user; scoped via users.tenant_id in API)
-- Applied after users exist (001_lan_core)

CREATE TABLE IF NOT EXISTS personal_tasks (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON personal_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_target_date ON personal_tasks(target_date);
