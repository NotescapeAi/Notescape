import asyncio
import os
import sys
from datetime import date, datetime, timedelta
from dotenv import load_dotenv

# Set explicit DB URL for local debugging (since we are running from host, not container)
# Docker maps 5432 -> 5434 on host
os.environ["DATABASE_URL"] = "postgresql://notescape:notescape_pass@localhost:5434/notescape"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
os.environ["UPLOAD_ROOT"] = "uploads"  # Dummy path

# Load env vars before importing app modules
load_dotenv()

from app.core.db import db_conn

async def seed_analytics():
    print("Connecting to DB...")
    async with db_conn() as (conn, cur):
        print("Connected.")
        
        # Get user
        await cur.execute("SELECT DISTINCT user_id FROM study_sessions")
        users_sessions = await cur.fetchall()
        user_id = users_sessions[0][0] if users_sessions else "dev-user"
        print(f"Using user_id: {user_id}")
        
        # Insert historical study sessions
        today = date.today()
        
        # Create deck if not exists
        await cur.execute("SELECT id FROM classes LIMIT 1")
        deck_row = await cur.fetchone()
        if not deck_row:
             print("No decks found. Creating one...")
             await cur.execute("INSERT INTO classes (user_id, name, created_at, updated_at) VALUES (%s, 'Test Deck', now(), now()) RETURNING id", (user_id,))
             deck_id = (await cur.fetchone())[0]
        else:
             deck_id = deck_row[0]
        print(f"Using deck_id: {deck_id}")

        # Insert historical data
        for i in range(0, 40): # 40 days back, including today
            day = today - timedelta(days=i)
            print(f"Inserting data for {day}")
            
            # Study Session (30 mins)
            started_at = datetime.combine(day, datetime.min.time()) + timedelta(hours=10)
            ended_at = started_at + timedelta(minutes=30)
            active_seconds = 1800
            
            await cur.execute(
                """
                INSERT INTO study_sessions (user_id, class_id, started_at, ended_at, active_seconds)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (user_id, deck_id, started_at, ended_at, active_seconds)
            )
            
            # Study Event Rollups (Reviews)
            total_reviews = 10 + (i % 5) # Varying reviews
            total_time_ms = total_reviews * 5000 # 5s per review
            
            await cur.execute(
                """
                INSERT INTO study_event_rollups_daily 
                (user_id, day, deck_id, topic_id, total_reviews, again_count, hard_count, good_count, easy_count, total_response_time_ms, updated_at)
                VALUES (%s, %s, %s, '00000000-0000-0000-0000-000000000000', %s, 0, 0, %s, 0, %s, now())
                ON CONFLICT (user_id, day, deck_id, topic_id) DO UPDATE
                SET total_reviews = EXCLUDED.total_reviews,
                    total_response_time_ms = EXCLUDED.total_response_time_ms
                """,
                (user_id, day, deck_id, total_reviews, total_reviews, total_time_ms)
            )
            
        print("Data seeded successfully.")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_analytics())
