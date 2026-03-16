ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS hidden_from_history BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS hidden_from_history_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS quiz_attempts_user_history_visible_idx
  ON quiz_attempts (user_id, submitted_at DESC, started_at DESC);
