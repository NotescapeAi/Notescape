# app/core/db.py
import os
from typing import Optional
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool

def _normalize_dsn(url: str) -> str:
    # Allow SQLAlchemy-style DSNs in env (postgresql+psycopg2://...)
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return url

DATABASE_URL = _normalize_dsn(
    os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5432/notescape")
)

_pool: Optional[AsyncConnectionPool] = None

async def get_pool() -> AsyncConnectionPool:
    """
    Lazily create and open the pool the first time it is needed,
    *inside* an async context where a loop exists.
    """
    global _pool
    if _pool is None:
        # Don't open on init; opening requires a running loop.
        _pool = AsyncConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=5,
            open=False,
        )
    if not _pool.is_open:
        await _pool.open()
    return _pool

@asynccontextmanager
async def db_conn():
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            yield conn, cur

async def close_pool():
    global _pool
    if _pool and _pool.is_open:
        await _pool.close()
