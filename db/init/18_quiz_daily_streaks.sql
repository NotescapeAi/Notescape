-- Persistent Karachi-local daily quiz streak states.
-- This table is intentionally decoupled from quiz_attempts deletion.
CREATE TABLE IF NOT EXISTS quiz_daily_streaks (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
  first_attempt_at TIMESTAMPTZ NOT NULL,
  last_attempt_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_date)
);

CREATE INDEX IF NOT EXISTS quiz_daily_streaks_user_date_idx
  ON quiz_daily_streaks (user_id, local_date DESC);
