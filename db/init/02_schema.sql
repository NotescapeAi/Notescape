-- classes
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT,
  owner_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS owner_uid TEXT;
ALTER TABLE classes DROP COLUMN IF EXISTS description;


-- files
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_url TEXT NOT NULL,
  storage_key TEXT,
  size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'notescape';
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_backend TEXT DEFAULT 's3';


-- file chunks (pgvector)
CREATE TABLE IF NOT EXISTS file_chunks (
  id SERIAL PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  content TEXT NOT NULL,
  char_len INT NOT NULL DEFAULT 0,
  page_start INT,
  page_end INT,
  chunk_vector VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_chunks_file_idx ON file_chunks (file_id, idx);
CREATE INDEX IF NOT EXISTS file_chunks_vec_cosine_idx
  ON file_chunks USING ivfflat (chunk_vector vector_cosine_ops) WITH (lists='100');


-- flashcards
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  source_chunk_id INT REFERENCES file_chunks(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  hint TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  engine TEXT NOT NULL DEFAULT 'easyocr',
  output_json_key TEXT,
  output_text_key TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS method TEXT;
