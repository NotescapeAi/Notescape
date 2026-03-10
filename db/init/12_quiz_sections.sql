
-- Add columns for tracking section progress in quiz attempts
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS mcq_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS theory_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS current_section TEXT DEFAULT 'start';
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS section_statuses JSONB DEFAULT '{}'::jsonb;
