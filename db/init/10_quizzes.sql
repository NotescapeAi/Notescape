-- =========================
-- Quiz Generation + Attempts
-- =========================

-- Quizzes (one quiz is generated for a given class + file)
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Quiz',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {count, types, difficulty, premium_limit, ...}
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quizzes_class_idx ON quizzes (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quizzes_file_idx ON quizzes (file_id, created_at DESC);

-- Quiz questions (store MCQ + conceptual + definition + scenario)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id BIGSERIAL PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,

  qtype TEXT NOT NULL CHECK (qtype IN ('mcq','conceptual','definition','scenario','short_qa')),
  question TEXT NOT NULL,

  -- MCQ fields
  options TEXT[] DEFAULT NULL,
  correct_index INT DEFAULT NULL,  -- keep hidden in UI by default

  -- Non-MCQ answer key (hidden by default)
  answer_key TEXT DEFAULT NULL,

  -- Helpful for learning + trust
  explanation TEXT DEFAULT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',

  -- Traceability to PDF chunks
  source_chunk_id INT REFERENCES file_chunks(id) ON DELETE SET NULL,
  page_start INT,
  page_end INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_questions_quiz_idx ON quiz_questions (quiz_id, position);
CREATE INDEX IF NOT EXISTS quiz_questions_chunk_idx ON quiz_questions (source_chunk_id);

-- Attempts (submit quiz => compute score)
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress','submitted')) DEFAULT 'in_progress',
  score INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_attempts_quiz_idx ON quiz_attempts (quiz_id, created_at DESC);

-- Answers selected by user per question (for scoring + review)
CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id BIGSERIAL PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,

  selected_index INT DEFAULT NULL,  -- for MCQ
  written_answer TEXT DEFAULT NULL, -- for conceptual/short

  is_correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS quiz_attempt_answers_attempt_idx ON quiz_attempt_answers (attempt_id);

-- Async quiz generation jobs (mirror flashcard_jobs)
CREATE TABLE IF NOT EXISTS quiz_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress INT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, -- {count, types, difficulty, premium_tier, ...}
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS quiz_jobs_user_idx ON quiz_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_jobs_class_idx ON quiz_jobs (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_jobs_file_idx ON quiz_jobs (file_id, created_at DESC);
