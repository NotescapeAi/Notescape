import asyncio
from typing import List, Tuple

from app.core.db import db_conn
from app.lib.study_analytics import apply_study_review


async def _fetch_cards(limit: int = 5) -> List[Tuple[str, int, str | None]]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT f.id::text, f.class_id, f.file_id::text
            FROM flashcards f
            WHERE f.deleted_at IS NULL
            ORDER BY f.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return await cur.fetchall()


async def seed():
    cards = await _fetch_cards()
    if not cards:
        print("No flashcards found. Seed skipped.")
        return

    user_id = "dev-user"
    ratings = ["again", "hard", "good", "easy"]
    response_times = [4200, 3200, 2100, 1500]

    async with db_conn() as (conn, cur):
        for idx, (card_id, deck_id, topic_id) in enumerate(cards):
            rating = ratings[idx % len(ratings)]
            response_time_ms = response_times[idx % len(response_times)]
            await apply_study_review(
                cur,
                user_id=user_id,
                card_id=card_id,
                deck_id=deck_id,
                topic_id=topic_id,
                rating=rating,
                response_time_ms=response_time_ms,
            )
        await conn.commit()

    print(f"Seeded {len(cards)} study events.")


if __name__ == "__main__":
    asyncio.run(seed())
