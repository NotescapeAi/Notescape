ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS raw_json_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS metrics_json_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS correction_log_key TEXT;
ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS flashcard_source_key TEXT;

CREATE INDEX IF NOT EXISTS ocr_jobs_file_status_idx ON ocr_jobs (file_id, status, created_at DESC);
