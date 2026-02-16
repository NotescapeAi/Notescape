import re
import logging
from typing import Dict, Iterable, List

log = logging.getLogger("uvicorn.error")
_quiz_tag_table_checked = False
_quiz_tag_table_available = False


def normalize_tag_names(raw_tags: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for raw in raw_tags:
        if raw is None:
            continue
        tag = re.sub(r"\s+", " ", str(raw).strip().lower())
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag)
    return normalized


async def ensure_tags(cur, tags: Iterable[str]) -> Dict[str, int]:
    names = normalize_tag_names(tags)
    if not names:
        return {}

    ids_by_name: Dict[str, int] = {}
    for name in names:
        await cur.execute(
            """
            INSERT INTO tags (name)
            VALUES (%s)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            (name,),
        )
        ids_by_name[name] = int((await cur.fetchone())[0])
    return ids_by_name


async def sync_flashcard_tags(cur, flashcard_id: str, tags: Iterable[str]) -> List[str]:
    normalized = normalize_tag_names(tags)
    await cur.execute("DELETE FROM flashcard_tags WHERE flashcard_id=%s", (flashcard_id,))
    if not normalized:
        return []

    ids_by_name = await ensure_tags(cur, normalized)
    for tag_name in normalized:
        tag_id = ids_by_name.get(tag_name)
        if not tag_id:
            continue
        await cur.execute(
            """
            INSERT INTO flashcard_tags (flashcard_id, tag_id)
            VALUES (%s, %s)
            ON CONFLICT (flashcard_id, tag_id) DO NOTHING
            """,
            (flashcard_id, tag_id),
        )
    return normalized


async def sync_quiz_question_tags(cur, question_id: int, tags: Iterable[str]) -> List[str]:
    global _quiz_tag_table_checked, _quiz_tag_table_available
    if not _quiz_tag_table_checked:
        await cur.execute("SELECT to_regclass('public.quiz_question_tags')")
        _quiz_tag_table_available = (await cur.fetchone())[0] is not None
        _quiz_tag_table_checked = True
        if not _quiz_tag_table_available:
            log.warning("quiz_question_tags table is missing; skipping quiz question tag sync")
    if not _quiz_tag_table_available:
        return normalize_tag_names(tags)

    normalized = normalize_tag_names(tags)
    await cur.execute("DELETE FROM quiz_question_tags WHERE question_id=%s", (question_id,))
    if not normalized:
        return []

    ids_by_name = await ensure_tags(cur, normalized)
    for tag_name in normalized:
        tag_id = ids_by_name.get(tag_name)
        if not tag_id:
            continue
        await cur.execute(
            """
            INSERT INTO quiz_question_tags (question_id, tag_id)
            VALUES (%s, %s)
            ON CONFLICT (question_id, tag_id) DO NOTHING
            """,
            (question_id, tag_id),
        )
    return normalized
