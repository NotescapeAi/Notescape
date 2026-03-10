
-- Add time tracking columns to quiz_attempts
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS mcq_attempt_time INT DEFAULT 0;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS theory_attempt_time INT DEFAULT 0;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS total_attempt_time INT DEFAULT 0;
