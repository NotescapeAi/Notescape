
import asyncio
import os
from app.core.db import db_conn
from datetime import datetime

async def check_history():
    # Set up env vars if needed, but db_conn uses os.environ or defaults
    # Assuming running in same env
    
    user_id = "dev-user" # Or a real user ID if I can find one from logs. 
    # The logs show requests from 172.18.0.1.
    # The code uses get_request_user_uid.
    # I'll query without user_id filter first or just list all.
    
    async with db_conn() as (conn, cur):
        print("Executing query...")
        await cur.execute(
            """
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
            LIMIT 5
            """
        )
        rows = await cur.fetchall()
        print(f"Found {len(rows)} rows")
        for i, r in enumerate(rows):
            print(f"Row {i}: {r}")
            print(f"Types: {[type(x) for x in r]}")

if __name__ == "__main__":
    # Fix for Windows loop policy
    import platform
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    asyncio.run(check_history())
