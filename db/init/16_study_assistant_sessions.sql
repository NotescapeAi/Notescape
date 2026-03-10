-- Required for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Study Assistant sessions
CREATE TABLE IF NOT EXISTS study_assistant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New session',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_assistant_sessions_user_file_idx
ON study_assistant_sessions (user_id, file_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS study_assistant_sessions_user_class_idx
ON study_assistant_sessions (user_id, class_id, updated_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS study_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES study_assistant_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL DEFAULT '',
  selected_text TEXT,
  image_attachment JSONB,
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_assistant_messages_session_idx
ON study_assistant_messages (session_id, created_at);

-- Trigger function
CREATE OR REPLACE FUNCTION bump_study_assistant_session_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE study_assistant_sessions
  SET updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_study_assistant_session ON study_assistant_messages;

CREATE TRIGGER trg_bump_study_assistant_session
AFTER INSERT ON study_assistant_messages
FOR EACH ROW
EXECUTE FUNCTION bump_study_assistant_session_updated_at();