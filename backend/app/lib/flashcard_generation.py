from typing import List, Optional, Tuple, Dict

from app.core.db import db_conn
from app.lib.tags import normalize_tag_names, sync_flashcard_tags


def vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


async def pick_relevant_chunks(
    class_id: int,
    query_vec: List[float],
    top_k: int,
    file_ids: List[str],
    page_start: Optional[int],
    page_end: Optional[int],
) -> List[Tuple[int, str, str]]:
    vec_lit = vec_literal(query_vec)
    q = """
      SELECT fc.id, fc.content, f.id::text
      FROM file_chunks fc
      JOIN files f ON f.id = fc.file_id
      WHERE f.class_id = %s
        AND fc.chunk_vector IS NOT NULL
        AND (cardinality(%s::uuid[]) = 0 OR f.id = ANY(%s::uuid[]))
        AND (%s::int IS NULL OR fc.page_end >= %s::int)
        AND (%s::int IS NULL OR fc.page_start <= %s::int)
      ORDER BY fc.chunk_vector <=> %s::vector
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id, file_ids, file_ids, page_start, page_start, page_end, page_end, vec_lit, top_k))
        return await cur.fetchall()


async def insert_flashcards(
    class_id: int,
    file_id: Optional[str],
    cards: List[Dict],
    source_chunk_id: Optional[int],
    created_by: str,
) -> List[str]:
    out_ids: List[str] = []
    async with db_conn() as (conn, cur):
        for c in cards:
            q = (c.get("question") or "").strip()
            a = (c.get("answer") or "").strip()
            if not q or not a:
                continue
            hint = c.get("hint")
            diff = c.get("difficulty") or "medium"
            tags = normalize_tag_names(c.get("tags") or [])
            await cur.execute(
                """
                INSERT INTO flashcards (class_id, file_id, source_chunk_id, question, answer, hint, difficulty, tags, created_by, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                RETURNING id::text
                """,
                (class_id, file_id, source_chunk_id, q, a, hint, diff, tags, created_by),
            )
            row = await cur.fetchone()
            card_id = row[0]
            out_ids.append(card_id)
            await sync_flashcard_tags(cur, card_id, tags)
            if created_by:
                await cur.execute(
                    """
                    INSERT INTO card_review_state (card_id, user_id, next_review_at, repetitions, interval, ease_factor, lapse_count, updated_at)
                    VALUES (%s, %s, now(), 0, 0, 2.5, 0, now())
                    ON CONFLICT (card_id, user_id) DO NOTHING
                    """,
                    (card_id, created_by),
                )
        await conn.commit()
    return out_ids
