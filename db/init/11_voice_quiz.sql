-- Voice quiz attempt storage for flashcards
CREATE TABLE IF NOT EXISTS voice_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'voice' CHECK (mode = 'voice'),
  transcript TEXT,
  audio_url TEXT,
  user_rating INT NOT NULL CHECK (user_rating BETWEEN 1 AND 5),
  response_time_seconds NUMERIC(8, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_review_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS voice_quiz_attempts_user_idx
  ON voice_quiz_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_quiz_attempts_card_idx
  ON voice_quiz_attempts (flashcard_id, created_at DESC);
