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
  size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE files OWNER TO CURRENT_USER;

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
