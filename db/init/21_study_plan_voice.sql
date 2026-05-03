-- Study plans (day-wise actionable revision plans)
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  exam_date DATE,
  daily_time_minutes INT,
  preferred_mode TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','completed','archived')) DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_plans_user_idx ON study_plans (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS study_plans_class_idx ON study_plans (class_id, status, exam_date);

CREATE TABLE IF NOT EXISTS study_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  topic TEXT,
  task_type TEXT NOT NULL CHECK (task_type IN ('flashcards','quiz','voice_revision','chatbot_review','reading','mock_test')),
  title TEXT NOT NULL,
  description TEXT,
  linked_document_id UUID REFERENCES files(id) ON DELETE SET NULL,
  linked_flashcard_ids UUID[],
  linked_quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  estimated_minutes INT,
  status TEXT NOT NULL CHECK (status IN ('pending','completed','skipped','overdue')) DEFAULT 'pending',
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_plan_items_plan_idx ON study_plan_items (plan_id, date);
CREATE INDEX IF NOT EXISTS study_plan_items_status_idx ON study_plan_items (status, priority);

-- Voice revision sessions (hands-free revision runs)
CREATE TABLE IF NOT EXISTS voice_revision_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  document_id UUID REFERENCES files(id) ON DELETE SET NULL,
  topic TEXT,
  mode TEXT NOT NULL,
  duration_minutes INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('active','completed','cancelled')) DEFAULT 'active',
  overall_score NUMERIC(5,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_revision_sessions_user_idx ON voice_revision_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_revision_sessions_class_idx ON voice_revision_sessions (class_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_revision_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES voice_revision_sessions(id) ON DELETE CASCADE,
  topic TEXT,
  question TEXT,
  student_transcript TEXT,
  expected_answer TEXT,
  evaluation JSONB,
  score NUMERIC(5,2),
  is_correct BOOLEAN,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_revision_turns_session_idx ON voice_revision_turns (session_id, created_at);
CREATE INDEX IF NOT EXISTS voice_revision_turns_topic_idx ON voice_revision_turns (topic);

CREATE OR REPLACE VIEW voice_revision_topic_rollup AS
SELECT
  vrs.user_id,
  vrs.class_id,
  COALESCE(vrt.topic, vrs.topic, 'General') AS topic,
  COUNT(*)::int AS total_turns,
  AVG(COALESCE(vrt.score, 0)) AS avg_score,
  SUM(CASE WHEN COALESCE(vrt.score, 0) >= 70 THEN 1 ELSE 0 END)::int AS correct_turns,
  MAX(vrt.created_at) AS last_seen
FROM voice_revision_sessions vrs
JOIN voice_revision_turns vrt ON vrt.session_id = vrs.id
GROUP BY vrs.user_id, vrs.class_id, COALESCE(vrt.topic, vrs.topic, 'General');

