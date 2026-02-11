import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

from app.core.db import db_conn
from app.core.llm import get_quiz_generator  # you will add this in step 3.2

POLL_SECONDS = 2
log = logging.getLogger("uvicorn.error")


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
async def _fetch_chunks(file_id: str, limit: int = 40) -> List[Dict[str, Any]]:
    """
    Keep it simple: grab chunks for that file.
    Later we can improve relevance sampling (topical, coverage-based, etc.)
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
    difficulty: str
) -> str:
    """
    Build prompt with EXPLICIT instructions for exact MCQ vs subjective counts
    """
    joined = []
    for c in chunks:
        meta = f"(chunk_id={c['chunk_id']}, pages={c['page_start']}-{c['page_end']})"
        joined.append(meta + "\n" + c["text"])

    context = "\n\n---\n\n".join(joined)
    
    # Calculate exact counts
    if mcq_count is not None and mcq_count > 0:
        subjective_count = max(0, n_questions - mcq_count)
        # Build explicit breakdown
        breakdown = f"""
CRITICAL REQUIREMENT - QUESTION BREAKDOWN:
- EXACTLY {mcq_count} questions with type="mcq" (multiple choice with 4 options)
- EXACTLY {subjective_count} questions with type chosen from {[t for t in types if t != 'mcq']}
- TOTAL: EXACTLY {n_questions} questions

DO NOT DEVIATE FROM THESE COUNTS. If you generate {mcq_count + 1} or {mcq_count - 1} MCQs, that is WRONG.
"""
    else:
        breakdown = f"Generate {n_questions} questions total from types: {types}"

    return f"""
You are an exam-quality quiz generator.

{breakdown}

TASK:
Generate an educational quiz STRICTLY based on the provided context.
Do NOT use outside knowledge.

ALLOWED QUESTION TYPES: {types}
DIFFICULTY: {difficulty}

RULES FOR MCQ (type="mcq"):
- Exactly 4 options
- Only ONE correct option (index 0-3)
- Include correct_index field
- Include options array

RULES FOR NON-MCQ (type="conceptual"|"definition"|"scenario"|"short_qa"):
- Provide answer_key as text explanation
- NO options field
- NO correct_index field

OUTPUT FORMAT:
Return ONLY valid JSON, no markdown, no extra text.

{{
  "title": "Quiz title based on content",
  "items": [
    // MCQ EXAMPLE (you must generate EXACTLY {mcq_count if mcq_count else 'the specified number of'} of these):
    {{
      "type": "mcq",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "answer_key": null,
      "explanation": "Brief explanation (optional)",
      "difficulty": "{difficulty}",
      "source": {{"chunk_id": 123, "page_start": 1, "page_end": 1}}
    }},
    // NON-MCQ EXAMPLE (you must generate EXACTLY {subjective_count if mcq_count else 'the remaining'} of these):
    {{
      "type": "conceptual",
      "question": "Question text here?",
      "options": null,
      "correct_index": null,
      "answer_key": "Detailed answer here",
      "explanation": "Brief explanation (optional)",
      "difficulty": "{difficulty}",
      "source": {{"chunk_id": 124, "page_start": 2, "page_end": 2}}
    }}
  ]
}}

FINAL CHECK BEFORE RETURNING:
1. Count items where type="mcq" → MUST equal {mcq_count if mcq_count else 'the requested MCQ count'}
2. Count items where type!="mcq" → MUST equal {subjective_count if mcq_count else 'the requested subjective count'}
3. Total items.length → MUST equal {n_questions}

CONTEXT:
{context}
""".strip()

def _validate_and_fix_question_counts(
    items: List[Dict[str, Any]], 
    n_questions: int,
    mcq_count: Optional[int],
    types: List[str]
) -> List[Dict[str, Any]]:
    """
    Validate and fix question counts if LLM didn't follow instructions exactly.
    This is a safety net to ensure we get the exact counts requested.
    """
    if not mcq_count:
        return items[:n_questions]  # Just truncate to total if no specific MCQ count
    
    # Count actual MCQs and subjective
    mcqs = [item for item in items if item.get("type") == "mcq"]
    subjective = [item for item in items if item.get("type") != "mcq"]
    
    actual_mcq_count = len(mcqs)
    actual_subjective_count = len(subjective)
    expected_subjective_count = n_questions - mcq_count
    
    log.info(f"[quiz_worker] Question counts - Expected: {mcq_count} MCQs + {expected_subjective_count} Subjective = {n_questions} total")
    log.info(f"[quiz_worker] Question counts - Actual: {actual_mcq_count} MCQs + {actual_subjective_count} Subjective = {len(items)} total")
    
    # If counts are perfect, return as-is
    if actual_mcq_count == mcq_count and actual_subjective_count == expected_subjective_count:
        return items
    
    # Otherwise, fix the counts
    log.warning(f"[quiz_worker] Fixing question counts...")
    
    fixed_items = []
    
    # Add the correct number of MCQs
    if actual_mcq_count >= mcq_count:
        # We have enough MCQs, take the first mcq_count
        fixed_items.extend(mcqs[:mcq_count])
    else:
        # We don't have enough MCQs, take all we have
        fixed_items.extend(mcqs)
        # Log a warning
        log.warning(f"[quiz_worker] Only generated {actual_mcq_count} MCQs, needed {mcq_count}")
    
    # Add the correct number of subjective questions
    if actual_subjective_count >= expected_subjective_count:
        # We have enough subjective, take the first expected_subjective_count
        fixed_items.extend(subjective[:expected_subjective_count])
    else:
        # We don't have enough subjective, take all we have
        fixed_items.extend(subjective)
        # Log a warning
        log.warning(f"[quiz_worker] Only generated {actual_subjective_count} subjective, needed {expected_subjective_count}")
    
    # Ensure we have exactly n_questions total
    final_items = fixed_items[:n_questions]
    
    log.info(f"[quiz_worker] Fixed counts - {len([i for i in final_items if i.get('type') == 'mcq'])} MCQs + {len([i for i in final_items if i.get('type') != 'mcq'])} Subjective = {len(final_items)} total")
    
    return final_items
# -------------------------
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
                """,
                (
                    quiz_id, idx,
                    qtype, question,
                    options, correct_index, answer_key,
                    explanation, diff,
                    chunk_id, page_start, page_end
                ),
            )

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

            chunks = await _fetch_chunks(file_id=file_id, limit=40)
            if not chunks:
                raise RuntimeError("No chunks found for this file.")

            await _set_job_progress(job_id, 35)

            prompt = _build_prompt(
                chunks, 
                n_questions=n_questions,
                mcq_count=mcq_count,
                types=types, 
                difficulty=difficulty
            )

            result = await gen(prompt)

            await _set_job_progress(job_id, 70)

            title = result.get("title", "Quiz")
            items = result.get("items", [])
            
            if not items:
                raise RuntimeError("Model returned empty items list")
            
            # ← ADD THIS VALIDATION STEP
            items = _validate_and_fix_question_counts(
                items=items,
                n_questions=n_questions,
                mcq_count=mcq_count,
                types=types
            )

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
            await _set_job_failed(job_id, str(e))


if __name__ == "__main__":
    asyncio.run(run())