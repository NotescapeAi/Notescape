import time
import json
from typing import Dict, Any, List

from app.core.db import db_conn
from app.core.llm import get_embedder, get_card_generator
from app.core.embedding_cache import embed_texts_cached
from app.lib.flashcard_generation import pick_relevant_chunks, insert_flashcards

POLL_SECONDS = 2


async def _fetch_and_claim_job() -> Dict[str, Any] | None:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE flashcard_jobs
            SET status='running', started_at=now(), progress=5
            WHERE id = (
                SELECT id FROM flashcard_jobs
                WHERE status='queued'
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id::text, user_id, deck_id, payload
            """
        )
        row = await cur.fetchone()
        if row:
            await conn.commit()
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))
    return None


async def _update_progress(job_id: str, progress: int):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "UPDATE flashcard_jobs SET progress=%s WHERE id::text=%s",
            (progress, job_id),
        )
        await conn.commit()


async def _fail_job(job_id: str, error_message: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE flashcard_jobs
            SET status='failed', error_message=%s, finished_at=now()
            WHERE id::text=%s
            """,
            (error_message, job_id),
        )
        await conn.commit()


async def _complete_job(job_id: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE flashcard_jobs
            SET status='completed', progress=100, finished_at=now()
            WHERE id::text=%s
            """,
            (job_id,),
        )
        await conn.commit()


async def _generate_cards_from_payload(payload: Dict[str, Any], user_id: str) -> List[str]:
    embedder = get_embedder()
    generator = get_card_generator()

    class_id = payload["class_id"]
    file_ids = payload.get("file_ids") or []
    topic = payload.get("topic") or "Create high-yield study flashcards for this class content."
    style = payload.get("style") or "mixed"
    top_k = int(payload.get("top_k") or 12)
    n_cards = int(payload.get("n_cards") or 24)
    difficulty = payload.get("difficulty")
    page_start = payload.get("page_start")
    page_end = payload.get("page_end")

    effective_top_k = max(top_k, min(60, n_cards * 2))
    qvec = (await embed_texts_cached(embedder, [topic]))[0]
    hits = await pick_relevant_chunks(class_id, qvec, effective_top_k, file_ids, page_start, page_end)
    if not hits:
        raise RuntimeError("No chunks found for this class. Upload content first.")

    contexts: List[str] = []
    joined_all = "\n".join("- " + c[:1000] for _, c, _ in hits)
    contexts.append(joined_all)
    if len(hits) > 4:
        half = len(hits) // 2
        contexts.append("\n".join("- " + c[:1000] for _, c, _ in hits[:half]))
        contexts.append("\n".join("- " + c[:1000] for _, c, _ in hits[half:]))

    target = max(1, min(50, n_cards))
    collected: List[Dict[str, Any]] = []
    seen_q = set()

    attempts = 0
    while len(collected) < target and attempts < 6:
        need = target - len(collected)
        ctx = contexts[attempts % len(contexts)]
        batch = await generator.generate(ctx, need, style)
        for c in batch or []:
            q = (c.get("question") or "").strip()
            a = (c.get("answer") or "").strip()
            if not q or not a or q in seen_q:
                continue
            if difficulty:
                c["difficulty"] = difficulty
            collected.append(c)
            seen_q.add(q)
        attempts += 1

    if not collected:
        raise RuntimeError("Card generation returned no usable cards.")
    if len(collected) < target:
        raise RuntimeError(f"Card generation returned {len(collected)} cards (target {target}).")

    if len(collected) > target:
        collected = collected[:target]

    source_chunk_id = hits[0][0] if hits else None
    source_file_id = hits[0][2] if hits else (file_ids[0] if file_ids else None)
    return await insert_flashcards(class_id, source_file_id, collected, source_chunk_id, created_by=user_id)


async def run():
    while True:
        job = await _fetch_and_claim_job()
        if not job:
            time.sleep(POLL_SECONDS)
            continue

        job_id = job["id"]
        try:
            payload = job.get("payload") or {}
            if isinstance(payload, str):
                payload = json.loads(payload)
            if not payload.get("file_ids"):
                raise RuntimeError("Job payload missing file_ids")

            await _update_progress(job_id, 20)
            await _generate_cards_from_payload(payload, job["user_id"])
            await _complete_job(job_id)
        except Exception as exc:
            await _fail_job(job_id, str(exc))


if __name__ == "__main__":
    import asyncio

    asyncio.run(run())
