-- File processing status + errors
ALTER TABLE files ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'UPLOADED';
ALTER TABLE files ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ;
ALTER TABLE files ADD COLUMN IF NOT EXISTS ocr_job_id UUID;

-- Flashcards: scope by file
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS file_id UUID REFERENCES files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS flashcards_class_file_idx ON flashcards (class_id, file_id);

-- Backfill file_id from source_chunk_id where possible
UPDATE flashcards f
SET file_id = fc.file_id
FROM file_chunks fc
WHERE f.source_chunk_id = fc.id AND f.file_id IS NULL;

-- Chat history
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_sessions_user_class_idx ON chat_sessions (user_id, class_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, created_at ASC);

-- Spaced repetition SM-2 style fields (keep existing columns)
ALTER TABLE sr_card_state ADD COLUMN IF NOT EXISTS ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5;
ALTER TABLE sr_card_state ADD COLUMN IF NOT EXISTS interval_days INT NOT NULL DEFAULT 0;
ALTER TABLE sr_card_state ADD COLUMN IF NOT EXISTS repetitions INT NOT NULL DEFAULT 0;
ALTER TABLE sr_card_state ADD COLUMN IF NOT EXISTS lapses INT NOT NULL DEFAULT 0;
ALTER TABLE sr_card_state ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ NOT NULL DEFAULT now();
