import os, json
from typing import Optional, List, Tuple
from dataclasses import dataclass
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.core.db import db_conn

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"

def _use_fake() -> bool:
    return os.getenv("LLM_PROVIDER", "openai").lower() == "fake"

def _fake_embed_text(text: str) -> List[float]:
    bins = [0.0] * 256
    for ch in text:
        bins[ord(ch) % 256] += 1.0
    s = sum(bins) or 1.0
    bins = [b / s for b in bins]
    return (bins * (EMBED_DIM // 256))[:EMBED_DIM]

async def _embed_texts(texts: List[str]) -> List[List[float]]:
    if _use_fake():
        return [_fake_embed_text(t) for t in texts]
    else:
        from openai import OpenAI
        client = OpenAI()
        resp = client.embeddings.create(model=EMBED_MODEL, input=texts)
        return [d.embedding for d in resp.data]

class EnsureEmbeddingsReq(BaseModel):
    limit: Optional[int] = Field(default=500)

class GenerateReq(BaseModel):
    class_id: int
    topic: Optional[str] = None
    top_k: int = Field(default=12, ge=1, le=100)
    n_cards: int = Field(default=10, ge=1, le=50)

class FlashcardOut(BaseModel):
    id: str
    class_id: int
    source_chunk_id: Optional[int]
    question: str
    answer: str
    hint: Optional[str] = None
    difficulty: Optional[str] = "medium"
    tags: List[str] = []

@router.get("/ping")
async def ping():
    return {"status": "ok", "router": "flashcards"}

@router.post("/ensure-embeddings")
async def ensure_embeddings(body: EnsureEmbeddingsReq):
    # Keep this simple: fill any global missing embeddings
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT c.id, c.content
            FROM chunks c
            LEFT JOIN embeddings e ON e.chunk_id = c.id
            WHERE e.chunk_id IS NULL
            ORDER BY c.id
            LIMIT %s
            """,
            (body.limit or 500,),
        )
        rows = await cur.fetchall()
    if not rows:
        return {"inserted": 0, "message": "No missing embeddings."}
    ids = [r[0] for r in rows]
    texts = [r[1] for r in rows]
    vecs = await _embed_texts(texts)
    async with db_conn() as (conn, cur):
        for cid, vec in zip(ids, vecs):
            await cur.execute(
                """
                INSERT INTO embeddings (chunk_id, model, dim, vec)
                VALUES (%s, %s, %s, %s::vector)
                ON CONFLICT (chunk_id)
                DO UPDATE SET model=EXCLUDED.model, dim=EXCLUDED.dim, vec=EXCLUDED.vec
                """,
                (cid, EMBED_MODEL, EMBED_DIM, _vec_literal(vec)),
            )
        await conn.commit()
    return {"inserted": len(ids)}

async def _pick_relevant_chunks(class_id: int, query_vec: List[float], top_k: int) -> List[Tuple[int, str]]:
    q = """
        SELECT c.id, c.content
        FROM embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        JOIN files f ON f.id = c.file_id
        WHERE f.class_id = %s
        ORDER BY e.vec <=> %s::vector
        LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id, _vec_literal(query_vec), top_k))
        return await cur.fetchall()

async def _insert_flashcards(class_id: int, cards: List[dict], source_chunk_id: Optional[int]) -> List[str]:
    ids = []
    async with db_conn() as (conn, cur):
        for c in cards:
            question = (c.get("question") or "").strip()
            answer = (c.get("answer") or "").strip()
            if not question or not answer:
                continue
            hint = (c.get("hint") or None)
            difficulty = (c.get("difficulty") or "medium")
            tags = c.get("tags") or []
            await cur.execute(
                """
                INSERT INTO flashcards
                  (class_id, source_chunk_id, question, answer, hint, difficulty, tags, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'llm')
                RETURNING id::text
                """,
                (class_id, source_chunk_id, question, answer, hint, difficulty, tags),
            )
            row = await cur.fetchone()
            ids.append(row[0])
        await conn.commit()
    return ids

@router.post("/generate", response_model=List[FlashcardOut])
async def generate(req: GenerateReq):
    qtext = req.topic or "Create high-yield study flashcards for this class content."
    qvec = (await _embed_texts([qtext]))[0]
    hits = await _pick_relevant_chunks(req.class_id, qvec, req.top_k)
    if not hits:
        raise HTTPException(status_code=404, detail="No chunks found for this class. Upload content first.")

    # If using fake mode, synthesize cards locally (no paid API)
    cards: List[dict] = []
    if _use_fake():
        for i, (_, content) in enumerate(hits[:req.n_cards]):
            snippet = content.strip().replace("\n", " ")
            snippet = (snippet[:220] + "…") if len(snippet) > 220 else snippet
            cards.append({
                "question": f"Q{i+1}: What is the main idea?",
                "answer": snippet or "N/A",
                "hint": "Focus on key terms and relationships.",
                "difficulty": "medium",
                "tags": ["auto", "fake-mode"]
            })
    else:
        # Real LLM call (requires paid key)
        from openai import OpenAI
        client = OpenAI()
        joined = "\n\n".join("• " + c[:1000] for _, c in hits)
        system = (
            "You create concise, exam-style flashcards. "
            "Output ONLY valid JSON: {\"cards\": [{\"question\": \"...\", \"answer\": \"...\", "
            "\"hint\": \"optional\", \"difficulty\": \"easy|medium|hard\", \"tags\": [\"...\"]}, ...]}"
        )
        user = (
            "Context:\n" + joined + "\n\n"
            f"Make exactly {req.n_cards} flashcards. Be precise and avoid fluff."
        )
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
            temperature=0.2,
        )
        content = completion.choices[0].message.content.strip()
        try:
            data = json.loads(content)
            cards = data.get("cards", [])
            if not isinstance(cards, list):
                cards = []
        except Exception:
            # fallback: one card
            cards = [{"question": "Summarize the main idea.", "answer": content, "difficulty": "medium", "tags": []}]

    source_chunk_id = hits[0][0] if hits else None
    ids = await _insert_flashcards(req.class_id, cards, source_chunk_id)

    out = []
    for i, c in zip(ids, cards):
        out.append(
            FlashcardOut(
                id=i,
                class_id=req.class_id,
                source_chunk_id=source_chunk_id,
                question=c.get("question", ""),
                answer=c.get("answer", ""),
                hint=c.get("hint"),
                difficulty=c.get("difficulty", "medium"),
                tags=c.get("tags") or [],
            )
        )
    return out
