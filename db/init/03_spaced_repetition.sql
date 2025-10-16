CREATE TABLE IF NOT EXISTS sr_card_state (
  user_id TEXT NOT NULL,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  repetition INT NOT NULL DEFAULT 0,
  ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  interval_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,  -- fractional minutes allowed
  learning BOOLEAN NOT NULL DEFAULT TRUE,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_review TIMESTAMPTZ,
  PRIMARY KEY (user_id, card_id)
);
ALTER TABLE sr_card_state OWNER TO CURRENT_USER;

-- Review history (optional, good for analytics/debugging)
CREATE TABLE IF NOT EXISTS sr_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sr_reviews OWNER TO CURRENT_USER;

-- Helpful index for "what's due now"
CREATE INDEX IF NOT EXISTS idx_sr_due ON sr_card_state (user_id, due_at);