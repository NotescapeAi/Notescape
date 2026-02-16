CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  class_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'study',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cards_seen INTEGER,
  cards_completed INTEGER,
  correct_count INTEGER,
  incorrect_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_sessions_user_idx ON study_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS study_sessions_user_class_idx ON study_sessions (user_id, class_id, ended_at);
