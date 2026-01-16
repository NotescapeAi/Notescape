-- Ensure every flashcard job has a stable correlation identifier
ALTER TABLE flashcard_jobs
  ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid();

UPDATE flashcard_jobs
SET correlation_id = gen_random_uuid()
WHERE correlation_id IS NULL;

ALTER TABLE flashcard_jobs
  ALTER COLUMN correlation_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS flashcard_jobs_correlation_idx ON flashcard_jobs (correlation_id);
