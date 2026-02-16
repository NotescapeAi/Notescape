-- Flashcards manual CRUD + soft delete support
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill updated_at for existing rows
UPDATE flashcards
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS flashcards_deleted_idx ON flashcards (deleted_at);
