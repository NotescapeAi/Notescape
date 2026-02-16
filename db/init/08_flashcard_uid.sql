-- Add a stable external identifier for flashcards
ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS flashcard_uid UUID DEFAULT gen_random_uuid();

-- Backfill any existing rows that might not have the new value yet
UPDATE flashcards
SET flashcard_uid = gen_random_uuid()
WHERE flashcard_uid IS NULL;

-- Require the column to be present for every row
ALTER TABLE flashcards
  ALTER COLUMN flashcard_uid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS flashcards_flashcard_uid_idx ON flashcards (flashcard_uid);
