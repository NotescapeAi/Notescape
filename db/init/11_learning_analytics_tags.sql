-- Normalized tags + attempt analytics for weakness tracking

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flashcard_tags (
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flashcard_id, tag_id)
);
CREATE INDEX IF NOT EXISTS flashcard_tags_tag_idx ON flashcard_tags (tag_id);

CREATE TABLE IF NOT EXISTS quiz_question_tags (
  question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, tag_id)
);
CREATE INDEX IF NOT EXISTS quiz_question_tags_tag_idx ON quiz_question_tags (tag_id);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_time_ms INT
);
CREATE INDEX IF NOT EXISTS flashcard_reviews_user_time_idx ON flashcard_reviews (user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS flashcard_reviews_card_time_idx ON flashcard_reviews (flashcard_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_reviews_unique_event_idx
  ON flashcard_reviews (user_id, flashcard_id, reviewed_at, rating);

CREATE TABLE IF NOT EXISTS quiz_question_attempts (
  id BIGSERIAL PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  user_answer TEXT,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  missing_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  feedback TEXT,
  graded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_time_ms INT,
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS quiz_question_attempts_attempt_idx ON quiz_question_attempts (attempt_id, graded_at DESC);
CREATE INDEX IF NOT EXISTS quiz_question_attempts_question_idx ON quiz_question_attempts (question_id, graded_at DESC);

-- Backfill tag dictionary from existing flashcard tags
INSERT INTO tags (name)
SELECT DISTINCT lower(trim(tag_name))
FROM flashcards f
JOIN LATERAL unnest(COALESCE(f.tags, '{}'::text[])) AS t(tag_name) ON TRUE
WHERE trim(tag_name) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO flashcard_tags (flashcard_id, tag_id)
SELECT f.id, t.id
FROM flashcards f
JOIN LATERAL unnest(COALESCE(f.tags, '{}'::text[])) AS n(raw_name) ON TRUE
JOIN tags t ON t.name = lower(trim(n.raw_name))
WHERE trim(n.raw_name) <> ''
ON CONFLICT (flashcard_id, tag_id) DO NOTHING;

-- Ensure each quiz question has at least one tag fallback using its type
INSERT INTO tags (name)
SELECT DISTINCT lower(q.qtype)
FROM quiz_questions q
WHERE q.qtype IS NOT NULL
ON CONFLICT (name) DO NOTHING;

INSERT INTO quiz_question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM quiz_questions q
JOIN tags t ON t.name = lower(q.qtype)
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- Backfill flashcard review events from study_events when present
INSERT INTO flashcard_reviews (user_id, flashcard_id, rating, reviewed_at, response_time_ms)
SELECT se.user_id, se.card_id, se.rating::text, se.created_at, se.response_time_ms
FROM study_events se
ON CONFLICT DO NOTHING;

-- Backfill per-question attempts from legacy answer rows
INSERT INTO quiz_question_attempts (attempt_id, question_id, user_answer, score, is_correct, graded_at)
SELECT
  qaa.attempt_id,
  qaa.question_id,
  COALESCE(qaa.written_answer, CASE WHEN qaa.selected_index IS NULL THEN NULL ELSE qaa.selected_index::text END),
  CASE WHEN qaa.is_correct THEN 1 ELSE 0 END,
  COALESCE(qaa.is_correct, false),
  qaa.created_at
FROM quiz_attempt_answers qaa
ON CONFLICT (attempt_id, question_id) DO NOTHING;
