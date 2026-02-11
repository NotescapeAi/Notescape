import logging
from typing import List, Optional, Literal, Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])

# ---------- helpers ----------

async def _ensure_class_owner(class_id: int, user_id: str):
    if user_id == "dev-user":
        return
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT 1 FROM classes WHERE id=%s AND owner_uid=%s", (class_id, user_id))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")

async def _ensure_file_in_class(file_id: UUID, class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT 1 FROM files WHERE id=%s AND class_id=%s", (str(file_id), class_id))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="File not found in class")

# ---------- schemas ----------

QuizType = Literal["mcq", "conceptual", "definition", "scenario", "short_qa"]
Difficulty = Literal["easy", "medium", "hard"]

class CreateQuizJobReq(BaseModel):
    class_id: int
    file_id: UUID
    n_questions: int = Field(default=10, ge=1, le=50)
    mcq_count: Optional[int] = Field(default=None, ge=0, le=50)  # ← ADD THIS
    types: List[QuizType] = Field(default_factory=lambda: ["mcq", "conceptual"])
    difficulty: Difficulty = "medium"
    premium_tier: Optional[str] = None

class QuizJobOut(BaseModel):
    job_id: str
    status: str
    progress: int
    error_message: Optional[str] = None

class QuizListItem(BaseModel):
    id: str
    class_id: int
    file_id: str
    title: str
    created_at: Optional[str] = None

class QuizQuestionOut(BaseModel):
    id: int
    position: int
    qtype: str
    question: str
    options: Optional[List[str]] = None
    explanation: Optional[str] = None
    difficulty: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None

class QuizOut(BaseModel):
    quiz: QuizListItem
    items: List[QuizQuestionOut]

class QuizAnswerKeyItem(BaseModel):
    question_id: int
    correct_index: Optional[int] = None
    answer_key: Optional[str] = None

class StartAttemptOut(BaseModel):
    attempt_id: str
    quiz_id: str
    total: int

class SubmitAttemptReq(BaseModel):
    # for MCQ: selected_index
    # for conceptual/short: written_answer
    answers: List[Dict[str, Any]] = Field(default_factory=list)
    reveal_answers: bool = True

class SubmitAttemptOut(BaseModel):
    attempt_id: str
    quiz_id: str
    score: int
    total: int
    results: List[Dict[str, Any]]  # per-question correctness + (optional) answer key

# ---------- endpoints ----------

@router.get("/ping")
async def ping():
    return {"status": "ok", "router": "quizzes"}

# 1) Create quiz generation job (worker will process in Step 3)
@router.post("/jobs", response_model=QuizJobOut)
async def create_quiz_job(req: CreateQuizJobReq, user_id: str = Depends(get_request_user_uid)):
    await _ensure_class_owner(req.class_id, user_id)
    await _ensure_file_in_class(req.file_id, req.class_id)

    payload = {
        "n_questions": req.n_questions,
        "mcq_count": req.mcq_count,  # ← ADD THIS LINE
        "types": req.types,
        "difficulty": req.difficulty,
        "premium_tier": req.premium_tier,
    }

    # ... rest of the code stays the same
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO quiz_jobs (user_id, class_id, file_id, status, progress, payload)
            VALUES (%s, %s, %s, 'queued', 0, %s::jsonb)
            RETURNING id::text, status, progress
            """,
            (user_id, req.class_id, str(req.file_id), __import__("json").dumps(payload)),
        )
        row = await cur.fetchone()
        await conn.commit()

    return QuizJobOut(job_id=row[0], status=row[1], progress=row[2])

# 2) Poll job status
@router.get("/jobs/{job_id}", response_model=QuizJobOut)
async def get_quiz_job(job_id: UUID, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, status, progress, error_message
            FROM quiz_jobs
            WHERE id=%s AND user_id=%s
            """,
            (str(job_id), user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
    return QuizJobOut(job_id=row[0], status=row[1], progress=row[2], error_message=row[3])

# 3) List quizzes for a class
@router.get("", response_model=List[QuizListItem])
async def list_quizzes(class_id: int = Query(...), user_id: str = Depends(get_request_user_uid)):
    await _ensure_class_owner(class_id, user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, file_id::text, title, created_at
            FROM quizzes
            WHERE class_id=%s
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (class_id,),
        )
        rows = await cur.fetchall()

    out: List[QuizListItem] = []
    for r in rows:
        out.append(
            QuizListItem(
                id=r[0], class_id=r[1], file_id=r[2], title=r[3],
                created_at=r[4].isoformat() if r[4] else None
            )
        )
    return out

# 4) Get quiz WITHOUT answers (default UI)
@router.get("/{quiz_id}", response_model=QuizOut)
async def get_quiz(
    quiz_id: UUID = Path(...),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id::text, class_id, file_id::text, title, created_at FROM quizzes WHERE id=%s",
            (str(quiz_id),),
        )
        q = await cur.fetchone()
        if not q:
            raise HTTPException(status_code=404, detail="Quiz not found")

        await _ensure_class_owner(q[1], user_id)

        await cur.execute(
            """
            SELECT id, position, qtype, question, options, explanation, difficulty, page_start, page_end
            FROM quiz_questions
            WHERE quiz_id=%s
            ORDER BY position ASC, id ASC
            """,
            (str(quiz_id),),
        )
        rows = await cur.fetchall()

    quiz_meta = QuizListItem(
        id=q[0], class_id=q[1], file_id=q[2], title=q[3],
        created_at=q[4].isoformat() if q[4] else None
    )

    items = [
        QuizQuestionOut(
            id=r[0], position=r[1], qtype=r[2], question=r[3],
            options=r[4], explanation=r[5], difficulty=r[6],
            page_start=r[7], page_end=r[8]
        )
        for r in rows
    ]

    return QuizOut(quiz=quiz_meta, items=items)

# 5) Reveal answers endpoint (answer key)
@router.get("/{quiz_id}/answers", response_model=List[QuizAnswerKeyItem])
async def get_quiz_answers(quiz_id: UUID, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT class_id FROM quizzes WHERE id=%s", (str(quiz_id),))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Quiz not found")
        await _ensure_class_owner(row[0], user_id)

        await cur.execute(
            """
            SELECT id, correct_index, answer_key
            FROM quiz_questions
            WHERE quiz_id=%s
            ORDER BY position ASC, id ASC
            """,
            (str(quiz_id),),
        )
        rows = await cur.fetchall()

    return [QuizAnswerKeyItem(question_id=r[0], correct_index=r[1], answer_key=r[2]) for r in rows]

# 6) Start an attempt
@router.post("/{quiz_id}/attempts", response_model=StartAttemptOut)
async def start_attempt(quiz_id: UUID, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT class_id FROM quizzes WHERE id=%s", (str(quiz_id),))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Quiz not found")
        await _ensure_class_owner(row[0], user_id)

        await cur.execute("SELECT COUNT(*) FROM quiz_questions WHERE quiz_id=%s", (str(quiz_id),))
        total = int((await cur.fetchone())[0])

        await cur.execute(
            """
            INSERT INTO quiz_attempts (quiz_id, user_id, status, score, total)
            VALUES (%s, %s, 'in_progress', 0, %s)
            RETURNING id::text
            """,
            (str(quiz_id), user_id, total),
        )
        attempt_id = (await cur.fetchone())[0]
        await conn.commit()

    return StartAttemptOut(attempt_id=attempt_id, quiz_id=str(quiz_id), total=total)

# 7) Submit an attempt + auto-score MCQs
@router.post("/attempts/{attempt_id}/submit", response_model=SubmitAttemptOut)
async def submit_attempt(
    attempt_id: UUID,
    req: SubmitAttemptReq,
    user_id: str = Depends(get_request_user_uid),
):
    # Fetch attempt + quiz
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT quiz_id::text FROM quiz_attempts WHERE id=%s AND user_id=%s",
            (str(attempt_id), user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Attempt not found")
        quiz_id = row[0]

        # load all correct keys (MCQ only scored)
        await cur.execute(
            """
            SELECT id, qtype, correct_index, answer_key
            FROM quiz_questions
            WHERE quiz_id=%s
            ORDER BY position ASC, id ASC
            """,
            (quiz_id,),
        )
        qrows = await cur.fetchall()
        key = {int(r[0]): {"qtype": r[1], "correct_index": r[2], "answer_key": r[3]} for r in qrows}

        # insert/update attempt answers
        score = 0
        total_scored = 0
        results: List[Dict[str, Any]] = []

        for a in req.answers:
            qid = int(a.get("question_id"))
            if qid not in key:
                continue

            qmeta = key[qid]
            qtype = qmeta["qtype"]

            selected_index = a.get("selected_index")
            written = a.get("written_answer")

            is_correct = None
            if qtype == "mcq":
                total_scored += 1
                is_correct = (selected_index is not None and int(selected_index) == qmeta["correct_index"])
                if is_correct:
                    score += 1

            await cur.execute(
                """
                INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_index, written_answer, is_correct)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (attempt_id, question_id)
                DO UPDATE SET selected_index=EXCLUDED.selected_index,
                              written_answer=EXCLUDED.written_answer,
                              is_correct=EXCLUDED.is_correct
                """,
                (str(attempt_id), qid, selected_index, written, is_correct),
            )

            item = {"question_id": qid, "qtype": qtype, "is_correct": is_correct}
            if req.reveal_answers:
                item["correct_index"] = qmeta["correct_index"]
                item["answer_key"] = qmeta["answer_key"]
            results.append(item)

        # mark submitted
        await cur.execute(
            """
            UPDATE quiz_attempts
            SET status='submitted', score=%s, total=%s, submitted_at=now()
            WHERE id=%s AND user_id=%s
            """,
            (score, total_scored, str(attempt_id), user_id),
        )
        await conn.commit()

    return SubmitAttemptOut(
        attempt_id=str(attempt_id),
        quiz_id=quiz_id,
        score=score,
        total=total_scored,
        results=results,
    )
# Add this to your backend/app/routes/quizzes.py

@router.delete("/{quiz_id}")
async def delete_quiz(quiz_id: UUID, user_id: str = Depends(get_request_user_uid)):
    """
    Delete a quiz and all associated data (questions, attempts, etc.)
    
    This endpoint allows users to delete quizzes they own.
    Cascade delete should handle questions and attempts automatically
    if your database is set up with proper foreign key constraints.
    """
    async with db_conn() as (conn, cur):
        # First, check if the quiz exists and get the class_id
        await cur.execute(
            "SELECT class_id FROM quizzes WHERE id=%s",
            (str(quiz_id),)
        )
        row = await cur.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Quiz not found")
        
        class_id = row[0]
        
        # Verify the user owns the class (and therefore the quiz)
        await _ensure_class_owner(class_id, user_id)
        
        # Delete the quiz
        # If you have CASCADE DELETE set up on foreign keys, this will automatically
        # delete related quiz_questions and quiz_attempts
        await cur.execute(
            "DELETE FROM quizzes WHERE id=%s",
            (str(quiz_id),)
        )
        
        await conn.commit()
    
    return {"status": "deleted", "quiz_id": str(quiz_id)}

