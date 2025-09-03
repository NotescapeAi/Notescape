# app/routers/health.py
from fastapi import APIRouter
from app.core.db import db_conn

router = APIRouter(prefix="/health", tags=["health"])

@router.get("")
async def health_root():
    return {"ok": True}

@router.get("/db")
async def health_db():
    """
    Check DB connectivity, server version, pgvector presence,
    and existence of key tables.
    """
    async with db_conn() as (conn, cur):
        # who/where/version
        await cur.execute("SELECT current_database(), current_user, version();")
        db_name, db_user, pg_version = await cur.fetchone()

        # pgvector installed?
        await cur.execute("SELECT extversion FROM pg_extension WHERE extname='vector';")
        row = await cur.fetchone()
        vector = {"installed": bool(row), "version": row[0] if row else None}

        # required tables?
        await cur.execute("""
          SELECT
            (to_regclass('public.classes') IS NOT NULL)     AS has_classes,
            (to_regclass('public.files')   IS NOT NULL)     AS has_files,
            (to_regclass('public.chunks')  IS NOT NULL)     AS has_chunks,
            (to_regclass('public.embeddings') IS NOT NULL)  AS has_embeddings,
            (to_regclass('public.flashcards') IS NOT NULL)  AS has_flashcards
        """)
        exists = await cur.fetchone()
        tables = {
            "classes":     exists[0],
            "files":       exists[1],
            "chunks":      exists[2],
            "embeddings":  exists[3],
            "flashcards":  exists[4],
        }

    return {
        "ok": True,
        "database": db_name,
        "user": db_user,
        "server_version": pg_version,
        "pgvector": vector,
        "tables": tables,
    }
