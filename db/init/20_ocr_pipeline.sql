ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS raw_json_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS metrics_json_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS correction_log_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS flashcard_source_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS timing_ms JSONB;

ALTER TABLE files ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_progress INT DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS preview_key TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS preview_error TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'document';
ALTER TABLE files ADD COLUMN IF NOT EXISTS ocr_provider TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS ocr_confidence DOUBLE PRECISION;
ALTER TABLE files ADD COLUMN IF NOT EXISTS ocr_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ocr_jobs_file_status_idx ON ocr_jobs (file_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS files_class_content_hash_idx ON files (class_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS files_class_source_type_idx ON files (class_id, source_type);

CREATE TABLE IF NOT EXISTS handwritten_ocr_pages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  cleaned_text TEXT NOT NULL DEFAULT '',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT NOT NULL DEFAULT 'local',
  original_image_key TEXT,
  processed_image_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, page_number)
);

CREATE INDEX IF NOT EXISTS handwritten_ocr_pages_owner_idx ON handwritten_ocr_pages (user_id, class_id, file_id);
CREATE INDEX IF NOT EXISTS handwritten_ocr_pages_file_idx ON handwritten_ocr_pages (file_id, page_number);
