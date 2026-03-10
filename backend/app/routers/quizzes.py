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
    mcq_completed: bool = False
    theory_completed: bool = False
    current_section: str = "start"
    mcq_attempt_time: int = 0
    theory_attempt_time: int = 0

class SubmitAttemptReq(BaseModel):
    # for MCQ: selected_index
    # for conceptual/short: written_answer
    answers: List[Dict[str, Any]] = Field(default_factory=list)
    reveal_answers: bool = True
    section: Literal["mcq", "theory", "all"] = "all"
    time_taken: int = 0  # time taken for this section in seconds

class SubmitAttemptOut(BaseModel):
    attempt_id: str
    quiz_id: str
    score: int
    total: int
    mcq_score: int
    theory_score: int
    total_possible: int
    passed: bool
    results: List[Dict[str, Any]]  # per-question correctness + (optional) answer key
    mcq_attempt_time: int
    theory_attempt_time: int
    total_attempt_time: int

class QuizHistoryItem(BaseModel):
    attempt_id: str
    quiz_id: str
    quiz_title: str
    file_name: str
    attempted_at: str
    score: int
    total_possible: int
    mcq_score: int
    theory_score: int
    passed: bool
    mcq_count: int
    theory_count: int
    mcq_attempt_time: int
    theory_attempt_time: int
    total_attempt_time: int

class QuizAttemptDetail(BaseModel):
    attempt: QuizHistoryItem
    questions: List[Dict[str, Any]]

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

@router.get("/history", response_model=List[QuizHistoryItem])
async def get_quiz_history(user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT 
                qa.id::text,
                q.id::text,
                q.title,
                f.filename,
                qa.started_at,
                qa.score,
                qa.total_possible,
                qa.mcq_score,
                qa.theory_score,
                qa.passed,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.qtype = 'mcq') as mcq_count,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.qtype != 'mcq') as theory_count,
                qa.mcq_attempt_time,
                qa.theory_attempt_time,
                qa.total_attempt_time
            FROM quiz_attempts qa
            JOIN quizzes q ON qa.quiz_id = q.id
            JOIN files f ON q.file_id = f.id
            WHERE qa.user_id = %s AND qa.status = 'submitted'
            ORDER BY qa.started_at DESC
            """,
            (user_id,)
        )
        rows = await cur.fetchall()

    return [
        QuizHistoryItem(
            attempt_id=str(r[0]),
            quiz_id=str(r[1]),
            quiz_title=str(r[2] or "Untitled Quiz"),
            file_name=str(r[3] or "Unknown File"),
            attempted_at=r[4].isoformat() if r[4] else "",
            score=int(r[5] or 0),
            total_possible=int(r[6] or 0),
            mcq_score=int(r[7] or 0),
            theory_score=int(r[8] or 0),
            passed=bool(r[9] if r[9] is not None else False),
            mcq_count=int(r[10] or 0),
            theory_count=int(r[11] or 0),
            mcq_attempt_time=int(r[12] or 0),
            theory_attempt_time=int(r[13] or 0),
            total_attempt_time=int(r[14] or 0)
        )
        for r in rows
    ]

@router.get("/history/{attempt_id}", response_model=QuizAttemptDetail)
async def get_attempt_detail(attempt_id: UUID, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        # 1. Get attempt info
        await cur.execute(
            """
            SELECT 
                qa.id::text,
                q.id::text,
                q.title,
                f.filename,
                qa.started_at,
                qa.score,
                qa.total_possible,
                qa.mcq_score,
                qa.theory_score,
                qa.passed,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.qtype = 'mcq') as mcq_count,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.qtype != 'mcq') as theory_count,
                qa.mcq_attempt_time,
                qa.theory_attempt_time,
                qa.total_attempt_time
            FROM quiz_attempts qa
            JOIN quizzes q ON qa.quiz_id = q.id
            JOIN files f ON q.file_id = f.id
            WHERE qa.id = %s AND qa.user_id = %s
            """,
            (str(attempt_id), user_id)
        )
        r = await cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Attempt not found")
        
        history_item = QuizHistoryItem(
            attempt_id=str(r[0]),
            quiz_id=str(r[1]),
            quiz_title=str(r[2] or "Untitled Quiz"),
            file_name=str(r[3] or "Unknown File"),
            attempted_at=r[4].isoformat() if r[4] else "",
            score=int(r[5] or 0),
            total_possible=int(r[6] or 0),
            mcq_score=int(r[7] or 0),
            theory_score=int(r[8] or 0),
            passed=bool(r[9] if r[9] is not None else False),
            mcq_count=int(r[10] or 0),
            theory_count=int(r[11] or 0),
            mcq_attempt_time=int(r[12] or 0),
            theory_attempt_time=int(r[13] or 0),
            total_attempt_time=int(r[14] or 0)
        )

        # 2. Get questions and answers
        await cur.execute(
            """
            SELECT 
                qq.id,
                qq.qtype,
                qq.question,
                qq.options,
                qq.correct_index,
                qq.answer_key,
                qaa.selected_index,
                qaa.written_answer,
                qaa.is_correct,
                qaa.marks_awarded
            FROM quiz_questions qq
            LEFT JOIN quiz_attempt_answers qaa ON qq.id = qaa.question_id AND qaa.attempt_id = %s
            WHERE qq.quiz_id = %s
            ORDER BY qq.position ASC, qq.id ASC
            """,
            (str(attempt_id), r[1])
        )
        q_rows = await cur.fetchall()
        
        questions = []
        for qr in q_rows:
            questions.append({
                "id": qr[0],
                "qtype": qr[1],
                "question": qr[2],
                "options": qr[3],
                "correct_index": qr[4],
                "answer_key": qr[5],
                "selected_index": qr[6],
                "written_answer": qr[7],
                "is_correct": qr[8],
                "marks_awarded": qr[9] or 0,
                "max_marks": 1 if qr[1] == 'mcq' else 2
            })

    return QuizAttemptDetail(attempt=history_item, questions=questions)

@router.delete("/history/{attempt_id}")
async def delete_attempt(attempt_id: UUID, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "DELETE FROM quiz_attempts WHERE id=%s AND user_id=%s",
            (str(attempt_id), user_id)
        )
        if cur.rowcount == 0:
             raise HTTPException(status_code=404, detail="Attempt not found")
        await conn.commit()
    return {"status": "deleted"}

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

# 6) Start or Resume an attempt
@router.post("/{quiz_id}/attempts", response_model=StartAttemptOut)
async def start_attempt(quiz_id: UUID, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT class_id FROM quizzes WHERE id=%s", (str(quiz_id),))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Quiz not found")
        await _ensure_class_owner(row[0], user_id)

        # Check for existing in-progress attempt
        await cur.execute(
            """
            SELECT id::text, total, mcq_completed, theory_completed, current_section, mcq_attempt_time, theory_attempt_time
            FROM quiz_attempts
            WHERE quiz_id=%s AND user_id=%s AND status='in_progress'
            """,
            (str(quiz_id), user_id),
        )
        existing = await cur.fetchone()
        if existing:
            return StartAttemptOut(
                attempt_id=existing[0],
                quiz_id=str(quiz_id),
                total=existing[1],
                mcq_completed=existing[2] or False,
                theory_completed=existing[3] or False,
                current_section=existing[4] or "start",
                mcq_attempt_time=existing[5] or 0,
                theory_attempt_time=existing[6] or 0
            )

        await cur.execute("SELECT COUNT(*) FROM quiz_questions WHERE quiz_id=%s", (str(quiz_id),))
        total = int((await cur.fetchone())[0])

        await cur.execute(
            """
            INSERT INTO quiz_attempts (quiz_id, user_id, status, score, total, current_section)
            VALUES (%s, %s, 'in_progress', 0, %s, 'start')
            RETURNING id::text
            """,
            (str(quiz_id), user_id, total),
        )
        attempt_id = (await cur.fetchone())[0]
        await conn.commit()

    return StartAttemptOut(attempt_id=attempt_id, quiz_id=str(quiz_id), total=total)

# 7) Submit an attempt (partial or full)
from app.core.llm import grade_theory_answer

# ... imports ...

@router.post("/attempts/{attempt_id}/submit", response_model=SubmitAttemptOut)
async def submit_attempt(
    attempt_id: UUID,
    req: SubmitAttemptReq,
    user_id: str = Depends(get_request_user_uid),
):
    # Fetch attempt + quiz
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT quiz_id::text, mcq_completed, theory_completed, mcq_attempt_time, theory_attempt_time FROM quiz_attempts WHERE id=%s AND user_id=%s",
            (str(attempt_id), user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Attempt not found")
        quiz_id, mcq_done, theory_done, current_mcq_time, current_theory_time = row
        
        current_mcq_time = current_mcq_time or 0
        current_theory_time = current_theory_time or 0

        # load all correct keys (MCQ only scored)
        await cur.execute(
            """
            SELECT id, qtype, correct_index, answer_key, question
            FROM quiz_questions
            WHERE quiz_id=%s
            ORDER BY position ASC, id ASC
            """,
            (quiz_id,),
        )
        qrows = await cur.fetchall()
        key = {int(r[0]): {"qtype": r[1], "correct_index": r[2], "answer_key": r[3], "question": r[4]} for r in qrows}

        # insert/update attempt answers
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
            marks = 0
            
            if qtype == "mcq":
                is_correct = (selected_index is not None and int(selected_index) == qmeta["correct_index"])
                if is_correct:
                    marks = 1
            else:
                # Theory marking logic using LLM
                # - Empty = 0
                # - AI Grading: 0, 1, or 2
                if written and written.strip():
                    marks = await grade_theory_answer(
                        question=qmeta["question"],
                        expected_answer=qmeta["answer_key"] or "",
                        user_answer=written
                    )
                else:
                    marks = 0

            await cur.execute(
                """
                INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_index, written_answer, is_correct, marks_awarded)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (attempt_id, question_id)
                DO UPDATE SET selected_index=EXCLUDED.selected_index,
                              written_answer=EXCLUDED.written_answer,
                              is_correct=EXCLUDED.is_correct,
                              marks_awarded=EXCLUDED.marks_awarded
                """,
                (str(attempt_id), qid, selected_index, written, is_correct, marks),
            )

            item = {"question_id": qid, "qtype": qtype, "is_correct": is_correct, "marks": marks}
            if req.reveal_answers:
                item["correct_index"] = qmeta["correct_index"]
                item["answer_key"] = qmeta["answer_key"]
            results.append(item)

        # Update status and time based on section
        new_mcq_done = mcq_done
        new_theory_done = theory_done
        current_section = "start"
        
        # Accumulate time based on submitted section
        # NOTE: This assumes the frontend sends the *incremental* time or we trust it sends total for section
        # The frontend logic likely sends total elapsed for the section. 
        # We will just overwrite/add. 
        # Requirement says "time taken for this section". 
        # Let's assume req.time_taken is the duration spent in this session.
        # But a safer bet is to just update the column for that section.
        
        new_mcq_time = current_mcq_time
        new_theory_time = current_theory_time

        if req.section == "mcq":
            new_mcq_done = True
            current_section = "start" # Back to start unless everything done
            new_mcq_time = req.time_taken
        elif req.section == "theory":
            new_theory_done = True
            current_section = "start" # Back to start unless everything done
            new_theory_time = req.time_taken
        elif req.section == "all":
            new_mcq_done = True
            new_theory_done = True
            current_section = "completed"
            # If 'all', we might need heuristic or split. 
            # For now, put it all in theory if mcq done, or split?
            # Simpler: just add to total later.
        
        if new_mcq_done and new_theory_done:
            current_section = "completed"
        
        total_time = new_mcq_time + new_theory_time

        # Calculate total score from ALL stored answers
        await cur.execute(
            """
            SELECT q.qtype, a.marks_awarded
            FROM quiz_attempt_answers a
            JOIN quiz_questions q ON a.question_id = q.id
            WHERE a.attempt_id = %s
            """,
            (str(attempt_id),)
        )
        all_answers = await cur.fetchall()
        
        mcq_score = 0
        theory_score = 0
        
        for qtype, marks in all_answers:
            if qtype == "mcq":
                mcq_score += marks
            else:
                theory_score += marks

        # Calculate totals
        total_mcqs = sum(1 for k in key.values() if k["qtype"] == "mcq")
        total_theory = sum(1 for k in key.values() if k["qtype"] != "mcq")
        
        total_possible = (total_mcqs * 1) + (total_theory * 2)
        total_earned = mcq_score + theory_score
        
        passed = False
        if total_possible > 0:
            percentage = (total_earned / total_possible) * 100
            if percentage >= 70:
                passed = True

        status = 'submitted' if (new_mcq_done and new_theory_done) else 'in_progress'
        
        await cur.execute(
            """
            UPDATE quiz_attempts
            SET status=%s, 
                score=%s, 
                total=%s, 
                submitted_at=(CASE WHEN %s='submitted' THEN now() ELSE submitted_at END),
                mcq_completed=%s,
                theory_completed=%s,
                current_section=%s,
                mcq_score=%s,
                theory_score=%s,
                total_possible=%s,
                passed=%s,
                mcq_attempt_time=%s,
                theory_attempt_time=%s,
                total_attempt_time=%s
            WHERE id=%s AND user_id=%s
            """,
            (
                status, 
                total_earned, 
                total_possible, 
                status, 
                new_mcq_done, 
                new_theory_done, 
                current_section,
                mcq_score,
                theory_score,
                total_possible,
                passed,
                new_mcq_time,
                new_theory_time,
                total_time,
                str(attempt_id), 
                user_id
            ),
        )
        await conn.commit()

    return SubmitAttemptOut(
        attempt_id=str(attempt_id),
        quiz_id=quiz_id,
        score=total_earned,
        total=total_possible,
        mcq_score=mcq_score,
        theory_score=theory_score,
        total_possible=total_possible,
        passed=passed,
        results=results,
        mcq_attempt_time=new_mcq_time,
        theory_attempt_time=new_theory_time,
        total_attempt_time=total_time
    )
# Add this to your backend/app/routes/quizzes.py





