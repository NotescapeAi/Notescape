-- ============================================================
-- 15_chat_history.sql
-- Ensures chat_sessions + chat_messages are properly tracked
-- so full history is always retrievable in the correct order.
-- ============================================================

-- 1. Add updated_at to chat_sessions if missing
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: set updated_at = most recent message created_at for each session
UPDATE chat_sessions cs
SET updated_at = sub.last_msg
FROM (
  SELECT session_id, MAX(created_at) AS last_msg
  FROM chat_messages
  GROUP BY session_id
) sub
WHERE cs.id = sub.session_id
  AND sub.last_msg > cs.updated_at;

-- Index for fast "most recent sessions first" queries
CREATE INDEX IF NOT EXISTS chat_sessions_updated_idx
  ON chat_sessions (user_id, updated_at DESC);

-- 2. Auto-bump updated_at on chat_sessions whenever a message is inserted
CREATE OR REPLACE FUNCTION bump_chat_session_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_sessions
  SET updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_chat_session_updated_at ON chat_messages;
CREATE TRIGGER trg_bump_chat_session_updated_at
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION bump_chat_session_updated_at();

-- 3. Add message_index so messages always load in correct order
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS message_index SERIAL;

-- Index for ordered message retrieval
CREATE INDEX IF NOT EXISTS chat_messages_session_order_idx
  ON chat_messages (session_id, message_index ASC);

-- 4. Ensure title column exists and has a sensible default
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'New chat';