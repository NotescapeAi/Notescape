from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def sm2_update(interval: int, ease_factor: float, repetitions: int, lapse_count: int, rating: str) -> Dict[str, object]:
    """
    Deterministic SM-2 style scheduling using persisted state only.
    """
    now = _now_utc()
    interval = int(interval)
    repetitions = int(repetitions)
    lapse_count = int(lapse_count)
    ease_factor = float(ease_factor)

    if rating == "again":
        ease_factor = max(1.3, ease_factor - 0.2)
        repetitions = 0
        lapse_count += 1
        interval = 0
        next_review_at = now + timedelta(minutes=10)
        state = "learning"
    elif rating == "hard":
        ease_factor = max(1.3, ease_factor - 0.15)
        repetitions += 1
        interval = 1 if interval == 0 else max(1, round(interval * 1.2))
        next_review_at = now + timedelta(days=interval)
        state = "review"
    elif rating == "good":
        repetitions += 1
        if repetitions == 1:
            interval = 1
        elif repetitions == 2:
            interval = 3
        else:
            interval = max(1, round(interval * ease_factor))
        next_review_at = now + timedelta(days=interval)
        state = "review"
    else:
        ease_factor = min(2.8, ease_factor + 0.15)
        repetitions += 1
        if repetitions == 1:
            interval = 1
        elif repetitions == 2:
            interval = 4
        else:
            interval = max(1, round(interval * ease_factor * 1.3))
        next_review_at = now + timedelta(days=interval)
        state = "review"

    return {
        "interval": interval,
        "ease_factor": ease_factor,
        "repetitions": repetitions,
        "lapse_count": lapse_count,
        "next_review_at": next_review_at,
        "state": state,
    }


async def apply_study_review(
    cur,
    *,
    user_id: str,
    card_id: str,
    deck_id: int,
    topic_id: Optional[str],
    rating: str,
    response_time_ms: Optional[int],
) -> Dict[str, object]:
    topic_id_value = topic_id or NULL_TOPIC_ID
    await cur.execute(
        """
        SELECT interval, ease_factor, repetitions, lapse_count
        FROM card_review_state
        WHERE user_id=%s AND card_id=%s
        FOR UPDATE
        """,
        (user_id, card_id),
    )
    row = await cur.fetchone()
    if row:
        interval, ease_factor, repetitions, lapse_count = row
    else:
        interval, ease_factor, repetitions, lapse_count = 0, 2.5, 0, 0

    updated = sm2_update(interval, ease_factor, repetitions, lapse_count, rating)

    await cur.execute(
        """
        INSERT INTO card_review_state
          (user_id, card_id, interval, ease_factor, repetitions, next_review_at, lapse_count, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, now())
        ON CONFLICT (user_id, card_id) DO UPDATE
        SET interval=EXCLUDED.interval,
            ease_factor=EXCLUDED.ease_factor,
            repetitions=EXCLUDED.repetitions,
            next_review_at=EXCLUDED.next_review_at,
            lapse_count=EXCLUDED.lapse_count,
            updated_at=now()
        """,
        (
            user_id,
            card_id,
            updated["interval"],
            updated["ease_factor"],
            updated["repetitions"],
            updated["next_review_at"],
            updated["lapse_count"],
        ),
    )

    await cur.execute(
        """
        INSERT INTO study_events (user_id, card_id, deck_id, topic_id, rating, response_time_ms)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (user_id, card_id, deck_id, topic_id_value, rating, response_time_ms),
    )
    await cur.execute(
        """
        INSERT INTO flashcard_reviews (user_id, flashcard_id, rating, reviewed_at, response_time_ms)
        VALUES (%s, %s, %s, now(), %s)
        """,
        (user_id, card_id, rating, response_time_ms),
    )

    await cur.execute(
        """
        INSERT INTO study_event_rollups_daily
          (user_id, day, deck_id, topic_id, total_reviews, again_count, hard_count, good_count, easy_count, total_response_time_ms, updated_at)
        VALUES
          (%s, date_trunc('day', now())::date, %s, %s, 1,
           CASE WHEN %s = 'again' THEN 1 ELSE 0 END,
           CASE WHEN %s = 'hard' THEN 1 ELSE 0 END,
           CASE WHEN %s = 'good' THEN 1 ELSE 0 END,
           CASE WHEN %s = 'easy' THEN 1 ELSE 0 END,
           COALESCE(%s, 0), now())
        ON CONFLICT (user_id, day, deck_id, topic_id) DO UPDATE
        SET total_reviews=study_event_rollups_daily.total_reviews + 1,
            again_count=study_event_rollups_daily.again_count + CASE WHEN %s = 'again' THEN 1 ELSE 0 END,
            hard_count=study_event_rollups_daily.hard_count + CASE WHEN %s = 'hard' THEN 1 ELSE 0 END,
            good_count=study_event_rollups_daily.good_count + CASE WHEN %s = 'good' THEN 1 ELSE 0 END,
            easy_count=study_event_rollups_daily.easy_count + CASE WHEN %s = 'easy' THEN 1 ELSE 0 END,
            total_response_time_ms=study_event_rollups_daily.total_response_time_ms + COALESCE(%s, 0),
            updated_at=now()
        """,
        (
            user_id,
            deck_id,
            topic_id_value,
            rating,
            rating,
            rating,
            rating,
            response_time_ms,
            rating,
            rating,
            rating,
            rating,
            response_time_ms,
        ),
    )

    await cur.execute(
        """
        INSERT INTO study_event_rollups_card_daily
          (user_id, day, card_id, deck_id, topic_id, total_reviews, again_count, hard_count, good_count, easy_count, total_response_time_ms, updated_at)
        VALUES
          (%s, date_trunc('day', now())::date, %s, %s, %s, 1,
           CASE WHEN %s = 'again' THEN 1 ELSE 0 END,
           CASE WHEN %s = 'hard' THEN 1 ELSE 0 END,
           CASE WHEN %s = 'good' THEN 1 ELSE 0 END,
           CASE WHEN %s = 'easy' THEN 1 ELSE 0 END,
           COALESCE(%s, 0), now())
        ON CONFLICT (user_id, day, card_id) DO UPDATE
        SET total_reviews=study_event_rollups_card_daily.total_reviews + 1,
            again_count=study_event_rollups_card_daily.again_count + CASE WHEN %s = 'again' THEN 1 ELSE 0 END,
            hard_count=study_event_rollups_card_daily.hard_count + CASE WHEN %s = 'hard' THEN 1 ELSE 0 END,
            good_count=study_event_rollups_card_daily.good_count + CASE WHEN %s = 'good' THEN 1 ELSE 0 END,
            easy_count=study_event_rollups_card_daily.easy_count + CASE WHEN %s = 'easy' THEN 1 ELSE 0 END,
            total_response_time_ms=study_event_rollups_card_daily.total_response_time_ms + COALESCE(%s, 0),
            updated_at=now()
        """,
        (
            user_id,
            card_id,
            deck_id,
            topic_id_value,
            rating,
            rating,
            rating,
            rating,
            response_time_ms,
            rating,
            rating,
            rating,
            rating,
            response_time_ms,
        ),
    )

    return updated
NULL_TOPIC_ID = "00000000-0000-0000-0000-000000000000"
