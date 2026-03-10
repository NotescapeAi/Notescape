-- ================================================================
-- 17_chat_sessions_document_id.sql
-- Adds document_id to chat_sessions so Study Assistant sessions
-- can be reliably filtered out of the Chatbot history sidebar.
-- ================================================================

-- Add document_id column (NULL = regular chatbot session)
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_document_idx
  ON chat_sessions (document_id)
  WHERE document_id IS NOT NULL;

-- Chatbot query should always filter: WHERE document_id IS NULL
-- Study Assistant query should filter: WHERE document_id = $file_id