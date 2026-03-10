
SELECT 
    qa.id::text,
    q.id::text,
    q.title,
    f.filename,
    qa.started_at,
    qa.score,
    qa.total_possible,
    qa.mcq_score,
    qa.theory_score,
    qa.passed,
    (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.qtype = 'mcq') as mcq_count,
    (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.qtype != 'mcq') as theory_count
FROM quiz_attempts qa
JOIN quizzes q ON qa.quiz_id = q.id
JOIN files f ON q.file_id = f.id
WHERE qa.status = 'submitted'
ORDER BY qa.started_at DESC
LIMIT 5;
