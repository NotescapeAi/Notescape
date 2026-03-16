import asyncio
import hashlib
import json
import logging
import math
import os
import random
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set

from app.core.db import db_conn
from app.core.llm import get_quiz_generator  # you will add this in step 3.2
from app.core.migrations import ensure_learning_analytics_schema, ensure_quiz_jobs_schema
from app.lib.tags import normalize_tag_names, sync_quiz_question_tags

POLL_SECONDS = 2
log = logging.getLogger("uvicorn.error")


def _is_rate_limit_error_message(message: str) -> bool:
    lowered = (message or "").lower()
    return (
        "rate limit" in lowered
        or "rate_limit_exceeded" in lowered
        or "tokens per day" in lowered
        or "429" in lowered
        or "insufficient_quota" in lowered
        or "insufficient balance" in lowered
        or "billing" in lowered
        or "hard limit" in lowered
        or "payment required" in lowered
    )


def _extract_retry_after(message: str) -> Optional[str]:
    if not message:
        return None
    match = re.search(r"try again in ([^.,'\"]+)", message, re.IGNORECASE)
    if not match:
        return None
    return match.group(1).strip()


# -------------------------
# 1) Claim a queued quiz job
# -------------------------
async def _fetch_and_claim_job() -> Optional[Dict[str, Any]]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE quiz_jobs
            SET status='running', started_at=now(), progress=5
            WHERE id = (
                SELECT id FROM quiz_jobs
                WHERE status='queued'
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id::text, user_id, class_id, file_id::text, payload
            """
        )
        row = await cur.fetchone()
        if not row:
            return None

        await conn.commit()
        cols = [d[0] for d in cur.description]
        job = dict(zip(cols, row))
        return job


# -------------------------
# 2) Fetch chunks for a PDF
# -------------------------
def _normalize_question_text(text: Optional[str]) -> str:
    if not text:
        return ""
    compact = " ".join(str(text).strip().lower().split())
    filtered = "".join(ch for ch in compact if ch.isalnum() or ch.isspace())
    return " ".join(filtered.split())


def _question_fingerprint(text: Optional[str]) -> str:
    normalized = _normalize_question_text(text)
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _question_token_set(text: Optional[str]) -> Set[str]:
    normalized = _normalize_question_text(text)
    tokens = [tok for tok in normalized.split(" ") if len(tok) > 2]
    return set(tokens)


def _jaccard_similarity(a: Set[str], b: Set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    if union == 0:
        return 0.0
    return inter / union


def _is_semantic_near_duplicate(a: Optional[str], b: Optional[str], threshold: float = 0.82) -> bool:
    return _jaccard_similarity(_question_token_set(a), _question_token_set(b)) >= threshold


def _shuffle_mcq_options(item: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    if item.get("type") != "mcq":
        return item

    options = item.get("options")
    correct_index = item.get("correct_index")
    if not isinstance(options, list) or len(options) != 4:
        return item
    if correct_index is None:
        return item

    indexed = list(enumerate(options))
    rng.shuffle(indexed)
    new_options = [opt for _, opt in indexed]
    new_correct_index = next((i for i, (old_i, _) in enumerate(indexed) if old_i == int(correct_index)), 0)

    item["options"] = new_options
    item["correct_index"] = new_correct_index
    return item


def _sample_chunks_distributed(
    chunks: List[Dict[str, Any]],
    target_count: int,
    rng: random.Random,
) -> List[Dict[str, Any]]:
    if not chunks:
        return []
    if target_count >= len(chunks):
        sampled = chunks[:]
        rng.shuffle(sampled)
        return sampled

    bins = min(max(6, target_count // 4), 18, len(chunks))
    per_bin_size = math.ceil(len(chunks) / bins)
    selected: List[Dict[str, Any]] = []

    for i in range(bins):
        start = i * per_bin_size
        end = min(len(chunks), start + per_bin_size)
        if start >= end:
            continue
        band = chunks[start:end]
        take = max(1, round(target_count / bins))
        if take >= len(band):
            selected.extend(band)
        else:
            selected.extend(rng.sample(band, take))

    # Trim or top-up randomly to exact target size.
    unique_by_chunk: Dict[Any, Dict[str, Any]] = {}
    for c in selected:
        unique_by_chunk[c.get("chunk_id")] = c
    selected_unique = list(unique_by_chunk.values())
    if len(selected_unique) > target_count:
        selected_unique = rng.sample(selected_unique, target_count)
    elif len(selected_unique) < target_count:
        remaining = [c for c in chunks if c.get("chunk_id") not in {x.get("chunk_id") for x in selected_unique}]
        if remaining:
            take_more = min(target_count - len(selected_unique), len(remaining))
            selected_unique.extend(rng.sample(remaining, take_more))

    rng.shuffle(selected_unique)
    return selected_unique


async def _fetch_recent_question_fingerprints(
    user_id: str,
    file_id: str,
    recent_quizzes: int = 12,
) -> Set[str]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT qq.question
            FROM quiz_questions qq
            JOIN quizzes q ON qq.quiz_id = q.id
            WHERE q.created_by = %s AND q.file_id = %s
            ORDER BY q.created_at DESC, qq.position ASC
            LIMIT %s
            """,
            (user_id, file_id, max(20, recent_quizzes * 30)),
        )
        rows = await cur.fetchall()

    fingerprints: Set[str] = set()
    for (question_text,) in rows:
        fp = _question_fingerprint(question_text)
        if fp:
            fingerprints.add(fp)
    return fingerprints


async def _fetch_recent_questions(
    user_id: str,
    file_id: str,
    recent_quizzes: int = 12,
) -> List[str]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT qq.question
            FROM quiz_questions qq
            JOIN quizzes q ON qq.quiz_id = q.id
            WHERE q.created_by = %s AND q.file_id = %s
            ORDER BY q.created_at DESC, qq.position ASC
            LIMIT %s
            """,
            (user_id, file_id, max(20, recent_quizzes * 30)),
        )
        rows = await cur.fetchall()
    return [str(r[0]) for r in rows if r and r[0]]


async def _fetch_chunks(file_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    """
    Fetch chunks from the whole file, then sample later for document-wide coverage.
    """
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id, content, page_start, page_end
            FROM file_chunks
            WHERE file_id = %s
            ORDER BY page_start NULLS LAST, id
            LIMIT %s
            """,
            (file_id, limit),
        )
        rows = await cur.fetchall()

    out = []
    for r in rows:
        out.append(
            {
                "chunk_id": r[0],
                "text": r[1],
                "page_start": r[2],
                "page_end": r[3],
            }
        )
    return out

def _build_prompt(
    chunks: List[Dict[str, Any]],
    n_questions: int,
    mcq_count: Optional[int],
    types: List[str],
    difficulty: str,
    variation_nonce: str,
) -> str:
    def _excerpt(text: Optional[str], max_chars: int = 900) -> str:
        compact = " ".join((text or "").split())
        if len(compact) <= max_chars:
            return compact
        return compact[:max_chars] + " ..."

    joined = []
    for c in chunks:
        meta = f"(chunk_id={c['chunk_id']}, pages={c['page_start']}-{c['page_end']})"
        joined.append(meta + "\n" + _excerpt(c.get("text")))

    context = "\n\n---\n\n".join(joined)
    non_mcq_types = [t for t in types if t != "mcq"] or ["conceptual", "definition", "scenario", "short_qa"]

    mix_instruction = (
        f"Try to include about {mcq_count} MCQs and {max(0, n_questions - (mcq_count or 0))} non-MCQs."
        if mcq_count is not None
        else "Use a balanced mix of allowed types."
    )

    return f"""
You are an exam-quality quiz generator.

TASK:
Generate {n_questions} distinct quiz items STRICTLY based on the provided context.
Do NOT use outside knowledge.

ALLOWED QUESTION TYPES: {types}
DIFFICULTY: {difficulty}
RANDOMIZATION NONCE: {variation_nonce}

QUALITY RULES:
- Prioritize reasoning, recall, and comprehension over shallow extraction.
- Cover different parts of the context (avoid clustering).
- Avoid rephrasing the same question multiple times.
- {mix_instruction}

FORMAT RULES:
- For MCQ (type="mcq"): exactly 4 options and one correct_index.
- For non-MCQ types ({non_mcq_types}): answer_key required, options=null, correct_index=null.
- Include source chunk_id/page_start/page_end for every question.

OUTPUT FORMAT:
Return ONLY valid JSON:
{{
  "title": "Quiz title based on content",
  "items": [
    {{
      "type": "mcq|conceptual|definition|scenario|short_qa",
      "question": "Question text",
      "options": ["A","B","C","D"] or null,
      "correct_index": 0 or null,
      "answer_key": "text or null",
      "explanation": "optional",
      "tags": ["topic one", "topic two"],
      "difficulty": "{difficulty}",
      "source": {{"chunk_id": 123, "page_start": 1, "page_end": 1}}
    }}
  ]
}}

CONTEXT:
{context}
""".strip()


def _sanitize_generated_items(
    items: List[Dict[str, Any]],
    allowed_types: List[str],
    difficulty: str,
) -> List[Dict[str, Any]]:
    sanitized: List[Dict[str, Any]] = []
    allowed = set(allowed_types or ["mcq", "conceptual"])

    for item in items:
        if not isinstance(item, dict):
            continue
        qtype = str(item.get("type") or "conceptual").strip().lower()
        if qtype not in allowed:
            continue
        question = str(item.get("question") or "").strip()
        if not question:
            continue

        src = item.get("source") or {}
        if not isinstance(src, dict):
            src = {}
        cleaned: Dict[str, Any] = {
            "type": qtype,
            "question": question,
            "explanation": item.get("explanation"),
            "tags": item.get("tags") or [],
            "difficulty": str(item.get("difficulty") or difficulty or "medium").lower(),
            "source": {
                "chunk_id": src.get("chunk_id"),
                "page_start": src.get("page_start"),
                "page_end": src.get("page_end"),
            },
        }

        if qtype == "mcq":
            options = item.get("options")
            correct_index = item.get("correct_index")
            if not isinstance(options, list) or len(options) != 4 or correct_index is None:
                continue
            try:
                correct_index = int(correct_index)
            except Exception:
                continue
            if correct_index < 0 or correct_index > 3:
                continue
            cleaned["options"] = [str(o).strip() for o in options]
            cleaned["correct_index"] = correct_index
            cleaned["answer_key"] = None
        else:
            answer_key = str(item.get("answer_key") or "").strip()
            if not answer_key:
                continue
            cleaned["options"] = None
            cleaned["correct_index"] = None
            cleaned["answer_key"] = answer_key

        sanitized.append(cleaned)

    return sanitized


def _dedupe_candidates(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen_fp: Set[str] = set()
    for item in items:
        question = item.get("question")
        fp = _question_fingerprint(question)
        if not fp or fp in seen_fp:
            continue
        if any(_is_semantic_near_duplicate(question, existing.get("question")) for existing in out):
            continue
        seen_fp.add(fp)
        out.append(item)
    return out


def _pick_with_coverage(
    pool: List[Dict[str, Any]],
    needed: int,
    recent_fps: Set[str],
    recent_questions: List[str],
    used_fps: Set[str],
    rng: random.Random,
) -> List[Dict[str, Any]]:
    if needed <= 0 or not pool:
        return []

    chunk_quota: Dict[Any, int] = defaultdict(int)
    max_per_chunk = max(1, math.ceil(needed / 3))

    unseen = [q for q in pool if _question_fingerprint(q.get("question")) not in recent_fps]
    seen = [q for q in pool if _question_fingerprint(q.get("question")) in recent_fps]
    rng.shuffle(unseen)
    rng.shuffle(seen)
    ordered = unseen + seen

    picked: List[Dict[str, Any]] = []
    for item in ordered:
        question_text = item.get("question")
        fp = _question_fingerprint(item.get("question"))
        if not fp or fp in used_fps:
            continue
        if any(_is_semantic_near_duplicate(question_text, rq, threshold=0.78) for rq in recent_questions):
            continue
        src = item.get("source") or {}
        chunk_id = src.get("chunk_id")
        if chunk_id is not None and chunk_quota[chunk_id] >= max_per_chunk:
            continue
        if any(_is_semantic_near_duplicate(item.get("question"), p.get("question")) for p in picked):
            continue
        picked.append(item)
        used_fps.add(fp)
        if chunk_id is not None:
            chunk_quota[chunk_id] += 1
        if len(picked) >= needed:
            break

    return picked


def _assemble_final_questions(
    candidate_items: List[Dict[str, Any]],
    n_questions: int,
    mcq_count: Optional[int],
    types: List[str],
    recent_fps: Set[str],
    recent_questions: List[str],
    rng: random.Random,
) -> List[Dict[str, Any]]:
    deduped = _dedupe_candidates(candidate_items)
    allowed_types = set(types or ["mcq", "conceptual"])
    deduped = [q for q in deduped if q.get("type") in allowed_types]

    mcq_pool = [q for q in deduped if q.get("type") == "mcq"]
    non_mcq_pool = [q for q in deduped if q.get("type") != "mcq"]
    used_fps: Set[str] = set()

    if mcq_count is None:
        picked = _pick_with_coverage(deduped, n_questions, recent_fps, recent_questions, used_fps, rng)
    else:
        expected_non_mcq = max(0, n_questions - mcq_count)
        picked_mcq = _pick_with_coverage(mcq_pool, mcq_count, recent_fps, recent_questions, used_fps, rng)
        picked_non_mcq = _pick_with_coverage(non_mcq_pool, expected_non_mcq, recent_fps, recent_questions, used_fps, rng)
        picked = picked_mcq + picked_non_mcq

        if len(picked) < n_questions:
            fill_pool = [q for q in deduped if _question_fingerprint(q.get("question")) not in used_fps]
            rng.shuffle(fill_pool)
            for item in fill_pool:
                picked.append(item)
                used_fps.add(_question_fingerprint(item.get("question")))
                if len(picked) >= n_questions:
                    break

    if len(picked) < n_questions:
        # Small-source fallback: maximize variation first, then allow repeats if unavoidable.
        fallback_pool = deduped or candidate_items
        rng.shuffle(fallback_pool)
        for item in fallback_pool:
            picked.append(item)
            if len(picked) >= n_questions:
                break
        while len(picked) < n_questions and fallback_pool:
            picked.append(rng.choice(fallback_pool))

    rng.shuffle(picked)
    picked = picked[:n_questions]

    final_items: List[Dict[str, Any]] = []
    for item in picked:
        final_items.append(_shuffle_mcq_options(item, rng))
    return final_items
# 3) Save quiz + questions
# -------------------------
async def _save_quiz(user_id: str, class_id: int, file_id: str, title: str, settings: Dict[str, Any], items: List[Dict[str, Any]]) -> str:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO quizzes (class_id, file_id, title, settings, created_by)
            VALUES (%s, %s, %s, %s::jsonb, %s)
            RETURNING id::text
            """,
            (class_id, file_id, title or "Quiz", json.dumps(settings), user_id),
        )
        quiz_id = (await cur.fetchone())[0]

        # insert questions
        for idx, it in enumerate(items):
            qtype = it.get("type")
            question = it.get("question")
            options = it.get("options")
            correct_index = it.get("correct_index")
            answer_key = it.get("answer_key")
            explanation = it.get("explanation")
            diff = it.get("difficulty", settings.get("difficulty", "medium"))

            src = it.get("source") or {}
            chunk_id = src.get("chunk_id")
            page_start = src.get("page_start")
            page_end = src.get("page_end")

            await cur.execute(
                """
                INSERT INTO quiz_questions
                (quiz_id, position, qtype, question, options, correct_index, answer_key,
                 explanation, difficulty, source_chunk_id, page_start, page_end)
                VALUES
                (%s, %s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    quiz_id, idx,
                    qtype, question,
                    options, correct_index, answer_key,
                    explanation, diff,
                    chunk_id, page_start, page_end
                ),
            )
            question_id = int((await cur.fetchone())[0])

            raw_tags = it.get("tags") or []
            if not isinstance(raw_tags, list):
                raw_tags = []
            normalized = normalize_tag_names(raw_tags)
            if not normalized:
                normalized = [str(qtype or "quiz")]
            await sync_quiz_question_tags(cur, question_id, normalized)

        await conn.commit()
        return quiz_id


# -------------------------
# 4) Mark job status
# -------------------------
async def _set_job_failed(job_id: str, message: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE quiz_jobs
            SET status='failed', progress=100, error_message=%s, finished_at=now()
            WHERE id=%s
            """,
            (message[:1000], job_id),
        )
        await conn.commit()


async def _set_job_completed(job_id: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE quiz_jobs
            SET status='completed', progress=100, finished_at=now()
            WHERE id=%s
            """,
            (job_id,),
        )
        await conn.commit()


async def _set_job_progress(job_id: str, p: int):
    async with db_conn() as (conn, cur):
        await cur.execute("UPDATE quiz_jobs SET progress=%s WHERE id=%s", (p, job_id))
        await conn.commit()


# -------------------------
# 5) Main loop
# -------------------------
async def run():
    log.info("[quiz_worker] running migrations before processing jobs")
    await ensure_quiz_jobs_schema()
    await ensure_learning_analytics_schema()
    log.info("[quiz_worker] started")
    gen = get_quiz_generator()

    while True:
        job = await _fetch_and_claim_job()
        if not job:
            await asyncio.sleep(POLL_SECONDS)
            continue

        job_id = job["id"]
        user_id = job["user_id"]
        class_id = job["class_id"]
        file_id = job["file_id"]
        payload = job["payload"] or {}

        try:
            settings = payload if isinstance(payload, dict) else json.loads(payload)
            n_questions = int(settings.get("n_questions", 10))
            mcq_count = settings.get("mcq_count")
            if mcq_count is not None:
                mcq_count = int(mcq_count)
            types = settings.get("types", ["mcq", "conceptual"])
            difficulty = settings.get("difficulty", "medium")

            await _set_job_progress(job_id, 15)

            all_chunks = await _fetch_chunks(file_id=file_id, limit=500)
            if not all_chunks:
                raise RuntimeError("No chunks found for this file.")

            rng = random.Random(int.from_bytes(os.urandom(16), byteorder="big"))
            recent_fps = await _fetch_recent_question_fingerprints(
                user_id=user_id,
                file_id=file_id,
                recent_quizzes=12,
            )
            recent_questions = await _fetch_recent_questions(
                user_id=user_id,
                file_id=file_id,
                recent_quizzes=12,
            )

            await _set_job_progress(job_id, 35)

            # Keep token usage moderate to avoid provider TPD/TPM spikes.
            candidate_target = min(36, max(n_questions * 2, n_questions + 6))
            candidate_mcq_target: Optional[int] = None
            if mcq_count is not None and n_questions > 0:
                candidate_mcq_target = max(0, min(candidate_target, round(candidate_target * (mcq_count / n_questions))))

            aggregated_items: List[Dict[str, Any]] = []
            title_candidates: List[str] = []
            generation_rounds = 3
            context_size = min(len(all_chunks), max(12, n_questions * 2))
            rate_limit_failure_message: Optional[str] = None

            for i in range(generation_rounds):
                sampled_chunks = _sample_chunks_distributed(all_chunks, context_size, rng)
                nonce = f"{job_id}-{i}-{rng.randint(1000, 999999)}"
                prompt = _build_prompt(
                    sampled_chunks,
                    n_questions=candidate_target,
                    mcq_count=candidate_mcq_target,
                    types=types,
                    difficulty=difficulty,
                    variation_nonce=nonce,
                )
                try:
                    result = await gen(prompt)
                except Exception as round_err:
                    round_err_text = str(round_err)
                    if _is_rate_limit_error_message(round_err_text):
                        retry_after = _extract_retry_after(round_err_text)
                        rate_limit_failure_message = (
                            "Quiz generation is temporarily limited by the AI provider (rate limit or billing/quota)."
                            f"{f' Please try again in about {retry_after}.' if retry_after else ' Please try again later.'}"
                        )
                        log.warning(
                            "[quiz_worker] rate-limited job=%s round=%s; stopping further rounds: %s",
                            job_id,
                            i + 1,
                            round_err_text,
                        )
                        break
                    log.warning(
                        "[quiz_worker] generation round failed job=%s round=%s error=%s",
                        job_id,
                        i + 1,
                        round_err,
                    )
                    continue
                title_candidates.append(str(result.get("title") or "Quiz"))
                raw_items = result.get("items", [])
                aggregated_items.extend(
                    _sanitize_generated_items(raw_items, allowed_types=types, difficulty=difficulty)
                )
                if len(aggregated_items) >= candidate_target * 2:
                    break

            await _set_job_progress(job_id, 70)

            if not aggregated_items:
                if rate_limit_failure_message:
                    raise RuntimeError(rate_limit_failure_message)
                raise RuntimeError("Quiz model returned no parseable question candidates.")

            items = _assemble_final_questions(
                candidate_items=aggregated_items,
                n_questions=n_questions,
                mcq_count=mcq_count,
                types=types,
                recent_fps=recent_fps,
                recent_questions=recent_questions[:120],
                rng=rng,
            )
            if len(items) < n_questions:
                raise RuntimeError(f"Could not assemble enough diverse questions ({len(items)}/{n_questions}).")

            title = next((t for t in title_candidates if t and t.strip()), "Quiz")
            quiz_id = await _save_quiz(
                user_id=user_id,
                class_id=class_id,
                file_id=file_id,
                title=title,
                settings=settings,
                items=items,
            )

            await _set_job_progress(job_id, 95)
            await _set_job_completed(job_id)

            log.info(f"[quiz_worker] completed job={job_id} quiz_id={quiz_id}")

        except Exception as e:
            log.exception(f"[quiz_worker] failed job={job_id}: {e}")
            err_text = str(e)
            if _is_rate_limit_error_message(err_text):
                retry_after = _extract_retry_after(err_text)
                detail = (
                    "Quiz generation is temporarily limited by the AI provider (rate limit or billing/quota)."
                    + (f" Please try again in about {retry_after}." if retry_after else " Please try again later.")
                )
                await _set_job_failed(job_id, detail)
                continue
            await _set_job_failed(
                job_id,
                "Something went wrong while generating quiz. Please try again.",
            )


if __name__ == "__main__":
    asyncio.run(run())
