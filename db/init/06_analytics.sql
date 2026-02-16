-- Study event logging + analytics rollups
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_rating') THEN
    CREATE TYPE study_rating AS ENUM ('again', 'hard', 'good', 'easy');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS study_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  deck_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  rating study_rating NOT NULL,
  response_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_events_user_time_idx ON study_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS study_events_topic_time_idx ON study_events (topic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS card_review_state (
  user_id TEXT NOT NULL,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  interval INT NOT NULL DEFAULT 0,
  ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  repetitions INT NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lapse_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX IF NOT EXISTS card_review_state_user_next_idx ON card_review_state (user_id, next_review_at);

CREATE TABLE IF NOT EXISTS study_event_rollups_daily (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  deck_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  total_reviews INT NOT NULL DEFAULT 0,
  again_count INT NOT NULL DEFAULT 0,
  hard_count INT NOT NULL DEFAULT 0,
  good_count INT NOT NULL DEFAULT 0,
  easy_count INT NOT NULL DEFAULT 0,
  total_response_time_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, deck_id, topic_id)
);
CREATE INDEX IF NOT EXISTS study_event_rollups_user_day_idx ON study_event_rollups_daily (user_id, day DESC);

CREATE TABLE IF NOT EXISTS study_event_rollups_card_daily (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  deck_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  total_reviews INT NOT NULL DEFAULT 0,
  again_count INT NOT NULL DEFAULT 0,
  hard_count INT NOT NULL DEFAULT 0,
  good_count INT NOT NULL DEFAULT 0,
  easy_count INT NOT NULL DEFAULT 0,
  total_response_time_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, card_id)
);
CREATE INDEX IF NOT EXISTS study_event_rollups_card_user_day_idx ON study_event_rollups_card_daily (user_id, day DESC);
CREATE INDEX IF NOT EXISTS study_event_rollups_card_card_idx ON study_event_rollups_card_daily (card_id);

-- Async flashcard generation jobs
CREATE TABLE IF NOT EXISTS flashcard_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  deck_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress INT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS flashcard_jobs_user_idx ON flashcard_jobs (user_id, created_at DESC);
