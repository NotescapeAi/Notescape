import asyncio
import os
from app.core.db import db_conn
from dotenv import load_dotenv

load_dotenv()

async def debug_queries():
    user_id = "dev-user"
    print(f"Testing queries for user: {user_id}")
    
    async with db_conn() as (conn, cur):
        print("\n--- Testing Weak Cards Query ---")
        try:
            await cur.execute(
                """
                SELECT 
                    f.id,
                    f.question,
                    f.deck_id,
                    f.topic_id,
                    SUM(ser.total_reviews) as total_reviews,
                    SUM(ser.again_count + ser.hard_count) as struggles,
                    COALESCE(crs.lapse_count, 0) as lapse_count,
                    COALESCE(crs.interval, 0) as interval,
                    CASE WHEN SUM(ser.total_reviews) > 0 THEN SUM(ser.total_response_time_ms) / SUM(ser.total_reviews) ELSE 0 END as avg_time
                FROM study_event_rollups_card_daily ser
                JOIN flashcards f ON ser.card_id = f.id
                LEFT JOIN card_review_state crs ON ser.card_id = crs.card_id AND ser.user_id = crs.user_id
                WHERE ser.user_id=%s
                GROUP BY f.id, f.question, f.deck_id, f.topic_id, crs.lapse_count, crs.interval
                HAVING SUM(ser.total_reviews) > 0
                ORDER BY (SUM(ser.again_count + ser.hard_count)::float / SUM(ser.total_reviews)) DESC, SUM(ser.total_reviews) DESC
                LIMIT 10
                """,
                (user_id,)
            )
            rows = await cur.fetchall()
            print("Weak Cards Query Successful!")
            print(f"Rows returned: {len(rows)}")
        except Exception as e:
            print(f"Weak Cards Query Failed: {e}")

        print("\n--- Testing Weak Tags Query ---")
        try:
            await cur.execute("""
                SELECT 
                    t.id, 
                    t.name,
                    COUNT(DISTINCT f.id) as card_count,
                    SUM(ser.again_count + ser.hard_count) as struggle_count,
                    CASE WHEN SUM(ser.total_reviews) > 0 THEN SUM(ser.total_response_time_ms) / SUM(ser.total_reviews) ELSE 0 END as avg_time
                FROM tags t
                JOIN flashcard_tags ft ON t.id = ft.tag_id
                JOIN flashcards f ON ft.flashcard_id = f.id
                JOIN study_event_rollups_card_daily ser ON f.id = ser.card_id
                WHERE ser.user_id = %s
                GROUP BY t.id, t.name
                HAVING COUNT(DISTINCT f.id) > 0
                ORDER BY struggle_count DESC
                LIMIT 10
            """, (user_id,))
            rows = await cur.fetchall()
            print("Weak Tags Query Successful!")
            print(f"Rows returned: {len(rows)}")
        except Exception as e:
            print(f"Weak Tags Query Failed: {e}")

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(debug_queries())
