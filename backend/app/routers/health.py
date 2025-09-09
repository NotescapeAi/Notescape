# app/routers/health.py
from fastapi import APIRouter
from app.core.db import db_conn

router = APIRouter(prefix="/health", tags=["health"])

@router.get("")
async def health_root():
    return {"status": "ok"}

@router.get("/db")
async def health_db():
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT current_database(), current_user, version()")
        db_name, db_user, pg_version = await cur.fetchone()

        await cur.execute("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector')")
        has_vector = (await cur.fetchone())[0]

        await cur.execute("SELECT extversion FROM pg_extension WHERE extname='vector'")
        row = await cur.fetchone()
        vector_version = row[0] if row else None

        await cur.execute("""
            SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='classes'),
                   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='files'),
                   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chunks'),
                   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='embeddings'),
                   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='flashcards')
        """)
        exists = await cur.fetchone()

    return {
        "ok": True,
        "database": db_name,
        "user": db_user,
        "server_version": pg_version,
        "pgvector": {"installed": bool(has_vector), "version": vector_version},
        "tables": {
            "classes":     exists[0],
            "files":       exists[1],
            "chunks":      exists[2],
            "embeddings":  exists[3],
            "flashcards":  exists[4],
        }
    }
