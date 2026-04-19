import asyncio
import hashlib
import json
import logging
import math
import os
import random
import re
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.db import db_conn
from app.core.llm import get_quiz_generator  # you will add this in step 3.2
from app.core.migrations import ensure_learning_analytics_schema, ensure_quiz_jobs_schema
from app.lib.quiz_counts import count_items_by_type, resolve_requested_counts, validate_quiz_counts
from app.lib.tags import normalize_tag_names, sync_quiz_question_tags

POLL_SECONDS = 2
QUIZ_GENERATION_RETRIES = max(1, int(os.environ.get("QUIZ_GENERATION_RETRIES", "2")))
QUIZ_CHUNK_CACHE_TTL_SECONDS = max(30, int(os.environ.get("QUIZ_CHUNK_CACHE_TTL_SECONDS", "600")))
log = logging.getLogger("uvicorn.error")
_QUIZ_CHUNK_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}


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


class QuizGenerationCountError(RuntimeError):
    def __init__(self, details: Dict[str, Any]):
        self.details = details
        super().__init__(details.get("failure_reason") or "quiz_generation_count_validation_failed")


async def _ensure_quiz_count_columns(cur) -> None:
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS requested_mcq_count INT")
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS requested_theory_count INT")
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS actual_mcq_count INT")
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS actual_theory_count INT")
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS failure_reason TEXT")
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS status_message TEXT")
    await cur.execute("ALTER TABLE quiz_jobs ADD COLUMN IF NOT EXISTS timing_ms JSONB")
    await cur.execute("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS requested_mcq_count INT")
    await cur.execute("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS requested_theory_count INT")
    await cur.execute("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS actual_mcq_count INT")
    await cur.execute("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS actual_theory_count INT")


# -------------------------
# 1) Claim a queued quiz job
# -------------------------
async def _fetch_and_claim_job() -> Optional[Dict[str, Any]]:
    async with db_conn() as (conn, cur):
        await _ensure_quiz_count_columns(cur)
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
            RETURNING id::text, user_id, class_id, file_id::text, payload,
                      requested_mcq_count, requested_theory_count
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


async def _fetch_recent_question_context(
    user_id: str,
    file_id: str,
    recent_quizzes: int = 12,
) -> Tuple[Set[str], List[str]]:
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
    questions: List[str] = []
    for (question_text,) in rows:
        normalized_text = str(question_text or "").strip()
        if not normalized_text:
            continue
        questions.append(normalized_text)
        fp = _question_fingerprint(normalized_text)
        if fp:
            fingerprints.add(fp)
    return fingerprints, questions


async def _fetch_chunks(file_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    """
    Fetch chunks from the whole file, then sample later for document-wide coverage.
    """
    cached = _QUIZ_CHUNK_CACHE.get(file_id)
    now = time.perf_counter()
    if cached and (now - cached[0]) < QUIZ_CHUNK_CACHE_TTL_SECONDS:
        return [dict(chunk) for chunk in cached[1][:limit]]

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
    _QUIZ_CHUNK_CACHE[file_id] = (now, out)
    return [dict(chunk) for chunk in out]

def _build_prompt(
    chunks: List[Dict[str, Any]],
    requested_count: int,
    batch_label: str,
    total_requested_mcq_count: int,
    total_requested_theory_count: int,
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
    is_mcq_batch = batch_label == "mcq"
    type_rule = (
        '- Every item must use type "mcq".'
        if is_mcq_batch
        else f"- Every item must use one of these non-MCQ types only: {non_mcq_types}."
    )

    return f"""
You are an exam-quality quiz generator.

TASK:
Generate EXACTLY {requested_count} distinct {batch_label} quiz items STRICTLY based on the provided context.
Do NOT use outside knowledge.
OVERALL QUIZ REQUEST: {total_requested_mcq_count} MCQs and {total_requested_theory_count} theory questions.
THIS BATCH MUST RETURN: exactly {requested_count} {batch_label} items.

ALLOWED QUESTION TYPES: {types}
DIFFICULTY: {difficulty}
RANDOMIZATION NONCE: {variation_nonce}

QUALITY RULES:
- Prioritize reasoning, recall, and comprehension over shallow extraction.
- Cover different parts of the context (avoid clustering).
- Avoid rephrasing the same question multiple times.
- Return exactly {requested_count} items.
- Do not return fewer or more items.
- Do not include disallowed question types.
{type_rule}

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


def _build_failure_details(
    requested_mcq_count: int,
    requested_theory_count: int,
    actual_mcq_count: int,
    actual_theory_count: int,
    failure_reason: str,
) -> Dict[str, Any]:
    details = validate_quiz_counts(
        requested_mcq_count=requested_mcq_count,
        requested_theory_count=requested_theory_count,
        actual_mcq_count=actual_mcq_count,
        actual_theory_count=actual_theory_count,
    )
    details["failure_reason"] = failure_reason
    return details


async def _generate_exact_batch(
    *,
    gen,
    all_chunks: List[Dict[str, Any]],
    requested_count: int,
    allowed_types: List[str],
    difficulty: str,
    batch_label: str,
    recent_fps: Set[str],
    recent_questions: List[str],
    rng: random.Random,
    total_requested_mcq_count: int,
    total_requested_theory_count: int,
    max_attempts: int = QUIZ_GENERATION_RETRIES,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    if requested_count <= 0:
        return [], []

    aggregated_items: List[Dict[str, Any]] = []
    title_candidates: List[str] = []
    used_fps: Set[str] = set()

    for attempt in range(max_attempts):
        remaining = requested_count - len(aggregated_items)
        if remaining <= 0:
            break

        context_size = min(len(all_chunks), max(8, min(18, remaining * 3)))
        sampled_chunks = _sample_chunks_distributed(all_chunks, context_size, rng)
        prompt = _build_prompt(
            sampled_chunks,
            requested_count=min(requested_count, remaining + 2),
            types=allowed_types,
            difficulty=difficulty,
            variation_nonce=f"{batch_label}-{attempt + 1}-{rng.randint(1000, 999999)}",
            batch_label=batch_label,
            total_requested_mcq_count=total_requested_mcq_count,
            total_requested_theory_count=total_requested_theory_count,
        )
        log.info(
            "[quiz_worker] %s batch prompt attempt=%s requested=%s overall_mcq=%s overall_theory=%s context_chunks=%s prompt_preview=%s",
            batch_label,
            attempt + 1,
            requested_count,
            total_requested_mcq_count,
            total_requested_theory_count,
            len(sampled_chunks),
            prompt[:800],
        )
        try:
            result = await gen(prompt)
        except Exception as err:
            if _is_rate_limit_error_message(str(err)):
                raise
            log.warning(
                "[quiz_worker] %s batch generation failed attempt=%s requested=%s error=%s",
                batch_label,
                attempt + 1,
                requested_count,
                err,
            )
            continue
        title_candidates.append(str(result.get("title") or "Quiz"))

        raw_items = result.get("items", [])
        sanitized = _sanitize_generated_items(
            raw_items,
            allowed_types=allowed_types,
            difficulty=difficulty,
        )
        deduped = _dedupe_candidates(sanitized)
        selected = _pick_with_coverage(
            pool=deduped,
            needed=remaining,
            recent_fps=recent_fps,
            recent_questions=recent_questions[:120],
            used_fps=used_fps,
            rng=rng,
        )
        if len(selected) < remaining:
            supplemental = _pick_with_coverage(
                pool=deduped,
                needed=remaining - len(selected),
                recent_fps=set(),
                recent_questions=[],
                used_fps=used_fps,
                rng=rng,
            )
            selected.extend(supplemental)
        aggregated_items.extend(selected)

        log.info(
            "[quiz_worker] %s batch counts attempt=%s generated_count_raw=%s parsed_count=%s valid_count=%s deduped_count=%s final_count=%s accumulated_count=%s",
            batch_label,
            attempt + 1,
            len(raw_items) if isinstance(raw_items, list) else 0,
            len(raw_items) if isinstance(raw_items, list) else 0,
            len(sanitized),
            len(deduped),
            len(selected),
            len(aggregated_items),
        )

        if len(aggregated_items) >= requested_count:
            break

    if len(aggregated_items) != requested_count:
        actual_mcq_count, actual_theory_count = count_items_by_type(aggregated_items)
        if batch_label == "mcq":
            raise QuizGenerationCountError(
                _build_failure_details(
                    requested_mcq_count=requested_count,
                    requested_theory_count=0,
                    actual_mcq_count=actual_mcq_count,
                    actual_theory_count=actual_theory_count,
                    failure_reason="insufficient_mcq_questions_generated",
                )
            )
        raise QuizGenerationCountError(
            _build_failure_details(
                requested_mcq_count=0,
                requested_theory_count=requested_count,
                actual_mcq_count=actual_mcq_count,
                actual_theory_count=actual_theory_count,
                failure_reason="insufficient_theory_questions_generated",
            )
        )

    return aggregated_items[:requested_count], title_candidates


async def _generate_quiz_items_exact(
    *,
    gen,
    all_chunks: List[Dict[str, Any]],
    requested_mcq_count: int,
    requested_theory_count: int,
    theory_types: List[str],
    difficulty: str,
    recent_fps: Set[str],
    recent_questions: List[str],
    rng: random.Random,
) -> Tuple[List[Dict[str, Any]], str, Dict[str, Any]]:
    mcq_items, mcq_titles, theory_items, theory_titles = [], [], [], []
    if requested_mcq_count > 0 and requested_theory_count > 0:
        mcq_task = _generate_exact_batch(
            gen=gen,
            all_chunks=all_chunks,
            requested_count=requested_mcq_count,
            allowed_types=["mcq"],
            difficulty=difficulty,
            batch_label="mcq",
            recent_fps=recent_fps,
            recent_questions=recent_questions,
            rng=random.Random(rng.randint(1, 10**9)),
            total_requested_mcq_count=requested_mcq_count,
            total_requested_theory_count=requested_theory_count,
        )
        theory_task = _generate_exact_batch(
            gen=gen,
            all_chunks=all_chunks,
            requested_count=requested_theory_count,
            allowed_types=theory_types,
            difficulty=difficulty,
            batch_label="theory",
            recent_fps=recent_fps,
            recent_questions=recent_questions,
            rng=random.Random(rng.randint(1, 10**9)),
            total_requested_mcq_count=requested_mcq_count,
            total_requested_theory_count=requested_theory_count,
        )
        (mcq_items, mcq_titles), (theory_items, theory_titles) = await asyncio.gather(mcq_task, theory_task)
    elif requested_mcq_count > 0:
        mcq_items, mcq_titles = await _generate_exact_batch(
            gen=gen,
            all_chunks=all_chunks,
            requested_count=requested_mcq_count,
            allowed_types=["mcq"],
            difficulty=difficulty,
            batch_label="mcq",
            recent_fps=recent_fps,
            recent_questions=recent_questions,
            rng=random.Random(rng.randint(1, 10**9)),
            total_requested_mcq_count=requested_mcq_count,
            total_requested_theory_count=requested_theory_count,
        )
    elif requested_theory_count > 0:
        theory_items, theory_titles = await _generate_exact_batch(
            gen=gen,
            all_chunks=all_chunks,
            requested_count=requested_theory_count,
            allowed_types=theory_types,
            difficulty=difficulty,
            batch_label="theory",
            recent_fps=recent_fps,
            recent_questions=recent_questions,
            rng=random.Random(rng.randint(1, 10**9)),
            total_requested_mcq_count=requested_mcq_count,
            total_requested_theory_count=requested_theory_count,
        )

    items = [_shuffle_mcq_options(item, rng) for item in mcq_items] + theory_items
    actual_mcq_count, actual_theory_count = count_items_by_type(items)
    validation = validate_quiz_counts(
        requested_mcq_count=requested_mcq_count,
        requested_theory_count=requested_theory_count,
        actual_mcq_count=actual_mcq_count,
        actual_theory_count=actual_theory_count,
    )
    if not validation["is_valid"]:
        raise QuizGenerationCountError(validation)

    title = next((t for t in mcq_titles + theory_titles if t and t.strip()), "Quiz")
    return items, title, validation
# 3) Save quiz + questions
# -------------------------
async def _save_quiz(
    user_id: str,
    class_id: int,
    file_id: str,
    title: str,
    settings: Dict[str, Any],
    items: List[Dict[str, Any]],
    requested_mcq_count: int,
    requested_theory_count: int,
    actual_mcq_count: int,
    actual_theory_count: int,
) -> str:
    async with db_conn() as (conn, cur):
        await _ensure_quiz_count_columns(cur)
        await cur.execute(
            """
            INSERT INTO quizzes (
                class_id,
                file_id,
                title,
                settings,
                created_by,
                requested_mcq_count,
                requested_theory_count,
                actual_mcq_count,
                actual_theory_count
            )
            VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)
            RETURNING id::text
            """,
            (
                class_id,
                file_id,
                title or "Quiz",
                json.dumps(settings),
                user_id,
                requested_mcq_count,
                requested_theory_count,
                actual_mcq_count,
                actual_theory_count,
            ),
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
async def _set_job_failed(job_id: str, message: str, details: Optional[Dict[str, Any]] = None):
    details = details or {}
    async with db_conn() as (conn, cur):
        await _ensure_quiz_count_columns(cur)
        await cur.execute(
            """
            UPDATE quiz_jobs
            SET status='failed',
                progress=100,
                status_message=%s,
                error_message=%s,
                failure_reason=%s,
                requested_mcq_count=COALESCE(%s, requested_mcq_count),
                requested_theory_count=COALESCE(%s, requested_theory_count),
                actual_mcq_count=%s,
                actual_theory_count=%s,
                timing_ms=COALESCE(%s::jsonb, timing_ms),
                finished_at=now()
            WHERE id=%s
            """,
            (
                details.get("status_message", "Generation failed"),
                message[:1000],
                details.get("failure_reason"),
                details.get("requested_mcq_count"),
                details.get("requested_theory_count"),
                details.get("actual_mcq_count"),
                details.get("actual_theory_count"),
                json.dumps(details.get("timing_ms")) if details.get("timing_ms") is not None else None,
                job_id,
            ),
        )
        await conn.commit()


async def _set_job_completed(job_id: str, details: Dict[str, Any]):
    async with db_conn() as (conn, cur):
        await _ensure_quiz_count_columns(cur)
        await cur.execute(
            """
            UPDATE quiz_jobs
            SET status='completed',
                progress=100,
                status_message=%s,
                error_message=NULL,
                failure_reason=NULL,
                requested_mcq_count=COALESCE(%s, requested_mcq_count),
                requested_theory_count=COALESCE(%s, requested_theory_count),
                actual_mcq_count=%s,
                actual_theory_count=%s,
                timing_ms=COALESCE(%s::jsonb, timing_ms),
                finished_at=now()
            WHERE id=%s
            """,
            (
                details.get("status_message", "Quiz ready"),
                details.get("requested_mcq_count"),
                details.get("requested_theory_count"),
                details.get("actual_mcq_count"),
                details.get("actual_theory_count"),
                json.dumps(details.get("timing_ms")) if details.get("timing_ms") is not None else None,
                job_id,
            ),
        )
        await conn.commit()


async def _set_job_progress(
    job_id: str,
    p: int,
    *,
    status_message: Optional[str] = None,
    timing_ms: Optional[Dict[str, int]] = None,
):
    async with db_conn() as (conn, cur):
        await _ensure_quiz_count_columns(cur)
        await cur.execute(
            """
            UPDATE quiz_jobs
            SET progress=%s,
                status_message=COALESCE(%s, status_message),
                timing_ms=COALESCE(%s::jsonb, timing_ms)
            WHERE id=%s
            """,
            (
                p,
                status_message,
                json.dumps(timing_ms) if timing_ms is not None else None,
                job_id,
            ),
        )
        await conn.commit()


def _timing_ms(started_at: float) -> int:
    return max(0, int((time.perf_counter() - started_at) * 1000))


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
            job_started_at = time.perf_counter()
            timing_ms: Dict[str, int] = {}
            settings = payload if isinstance(payload, dict) else json.loads(payload)
            n_questions = int(settings.get("n_questions", 10))
            mcq_count = settings.get("mcq_count")
            if mcq_count is not None:
                mcq_count = int(mcq_count)
            types = settings.get("types", ["mcq", "conceptual"])
            difficulty = settings.get("difficulty", "medium")
            requested_mcq_count, requested_theory_count = resolve_requested_counts(
                n_questions=n_questions,
                mcq_count=mcq_count,
                types=types,
            )
            theory_types = [str(t).strip().lower() for t in types if str(t).strip().lower() != "mcq"]

            await _set_job_progress(job_id, 12, status_message="Loading document context")

            load_started_at = time.perf_counter()
            all_chunks = await _fetch_chunks(file_id=file_id, limit=500)
            if not all_chunks:
                raise RuntimeError("No chunks found for this file.")
            timing_ms["load_chunks"] = _timing_ms(load_started_at)

            rng = random.Random(int.from_bytes(os.urandom(16), byteorder="big"))
            history_started_at = time.perf_counter()
            recent_fps, recent_questions = await _fetch_recent_question_context(
                user_id=user_id,
                file_id=file_id,
                recent_quizzes=12,
            )
            timing_ms["load_recent_questions"] = _timing_ms(history_started_at)

            await _set_job_progress(
                job_id,
                34,
                status_message="Preparing question plan",
                timing_ms=timing_ms,
            )

            if requested_theory_count > 0 and not theory_types:
                raise QuizGenerationCountError(
                    _build_failure_details(
                        requested_mcq_count=requested_mcq_count,
                        requested_theory_count=requested_theory_count,
                        actual_mcq_count=0,
                        actual_theory_count=0,
                        failure_reason="missing_allowed_theory_types",
                    )
                )

            generation_started_at = time.perf_counter()
            await _set_job_progress(
                job_id,
                58,
                status_message="Generating quiz questions",
                timing_ms=timing_ms,
            )
            items, title, validation = await _generate_quiz_items_exact(
                gen=gen,
                all_chunks=all_chunks,
                requested_mcq_count=requested_mcq_count,
                requested_theory_count=requested_theory_count,
                theory_types=theory_types,
                difficulty=difficulty,
                recent_fps=recent_fps,
                recent_questions=recent_questions,
                rng=rng,
            )
            timing_ms["generate_questions"] = _timing_ms(generation_started_at)

            await _set_job_progress(
                job_id,
                86,
                status_message="Saving quiz",
                timing_ms=timing_ms,
            )
            save_started_at = time.perf_counter()
            quiz_id = await _save_quiz(
                user_id=user_id,
                class_id=class_id,
                file_id=file_id,
                title=title,
                settings=settings,
                items=items,
                requested_mcq_count=requested_mcq_count,
                requested_theory_count=requested_theory_count,
                actual_mcq_count=validation["actual_mcq_count"],
                actual_theory_count=validation["actual_theory_count"],
            )
            timing_ms["save_quiz"] = _timing_ms(save_started_at)
            timing_ms["total"] = _timing_ms(job_started_at)

            await _set_job_progress(
                job_id,
                96,
                status_message="Finalizing quiz",
                timing_ms=timing_ms,
            )
            validation["timing_ms"] = timing_ms
            validation["status_message"] = "Quiz ready"
            await _set_job_completed(job_id, validation)

            log.info(
                "[quiz_worker] completed job=%s quiz_id=%s requested_mcq=%s requested_theory=%s actual_mcq=%s actual_theory=%s timing_ms=%s",
                job_id,
                quiz_id,
                requested_mcq_count,
                requested_theory_count,
                validation["actual_mcq_count"],
                validation["actual_theory_count"],
                timing_ms,
            )

        except Exception as e:
            log.exception(f"[quiz_worker] failed job={job_id}: {e}")
            err_text = str(e)
            if _is_rate_limit_error_message(err_text):
                retry_after = _extract_retry_after(err_text)
                detail = (
                    "Quiz generation is temporarily limited by the AI provider (rate limit or billing/quota)."
                    + (f" Please try again in about {retry_after}." if retry_after else " Please try again later.")
                )
                await _set_job_failed(
                    job_id,
                    detail,
                    {"status_message": "Generation failed", "timing_ms": timing_ms if "timing_ms" in locals() else None},
                )
                continue
            if isinstance(e, QuizGenerationCountError):
                details = e.details
                details["status_message"] = "Generation failed"
                if "timing_ms" in locals():
                    details["timing_ms"] = timing_ms
                await _set_job_failed(
                    job_id,
                    (
                        f"Quiz generation failed: {details.get('failure_reason')}. "
                        f"Requested {details.get('requested_mcq_count', 0)} MCQs and "
                        f"{details.get('requested_theory_count', 0)} theory questions, but got "
                        f"{details.get('actual_mcq_count', 0)} MCQs and "
                        f"{details.get('actual_theory_count', 0)} theory questions."
                    ),
                    details,
                )
                continue
            await _set_job_failed(
                job_id,
                "Something went wrong while generating quiz. Please try again.",
                {"status_message": "Generation failed", "timing_ms": timing_ms if "timing_ms" in locals() else None},
            )


if __name__ == "__main__":
    asyncio.run(run())
