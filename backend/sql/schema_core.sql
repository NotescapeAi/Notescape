-- Enable helpful extensions (safe to re-run)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) classes
CREATE TABLE IF NOT EXISTS classes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) files (belongs to classes)
CREATE TABLE IF NOT EXISTS files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  storage_url TEXT NOT NULL,   -- local path or S3 URL
  size_bytes  BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_class_id ON files(class_id);

-- 3) chunks (belongs to files)
-- NOTE: file_id is UUID referencing files.id
CREATE TABLE IF NOT EXISTS chunks (
  id          SERIAL PRIMARY KEY,
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx         INT  NOT NULL,          -- chunk index within a file
  content     TEXT NOT NULL,          -- raw text chunk
  token_count INT  NOT NULL,
  md5         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);
