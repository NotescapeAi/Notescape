
SELECT COUNT(*) FROM quizzes WHERE title IS NULL;
SELECT COUNT(*) FROM files WHERE filename IS NULL;
SELECT COUNT(*) FROM quiz_attempts WHERE started_at IS NULL;
