
-- Add columns for detailed scoring and history
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS mcq_score INT DEFAULT 0;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS theory_score INT DEFAULT 0;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS total_possible INT DEFAULT 0;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT FALSE;

-- Add score column to answers for granular marking
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS marks_awarded INT DEFAULT 0;
