-- classes
-- classes
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT,            -- ✅ add this line
  description TEXT,        -- (keep if you still want it)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE classes DROP COLUMN IF EXISTS description;


-- files
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_url TEXT NOT NULL,
  storage_key TEXT,                 -- NEW: object key in MinIO/S3
  size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'notescape';
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_backend TEXT DEFAULT 's3';


-- chunks
CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  content TEXT NOT NULL
);
ALTER TABLE chunks OWNER TO CURRENT_USER;

-- embeddings (pgvector)
CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id INT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INT NOT NULL,
  vec VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE embeddings OWNER TO CURRENT_USER;
CREATE INDEX IF NOT EXISTS idx_embeddings_vec ON embeddings USING ivfflat (vec vector_cosine_ops);

-- flashcards
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  source_chunk_id INT REFERENCES chunks(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer   TEXT NOT NULL,
  hint TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE flashcards OWNER TO CURRENT_USER;


CREATE TABLE IF NOT EXISTS ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|done|failed
  engine TEXT NOT NULL DEFAULT 'easyocr',
  output_json_key TEXT,   -- e.g. processed/ocr/<file_id>/ocr.json
  output_text_key TEXT,   -- e.g. processed/ocr/<file_id>/ocr.txt
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS method TEXT; 
-- method: 'pdf_text' or 'ocr'
