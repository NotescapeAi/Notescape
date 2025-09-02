# app/core/db.py
from contextlib import asynccontextmanager
from typing import Optional
from psycopg_pool import AsyncConnectionPool
from app.core.settings import settings

_pool: Optional[AsyncConnectionPool] = None

def _normalize_conninfo(url: str) -> str:
    # SQLAlchemy-style URL won't work for psycopg_pool; normalize it.
    # e.g. postgresql+psycopg2://...  ->  postgresql://...
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url.split("://", 1)[1]
    return url

async def get_pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        conninfo = _normalize_conninfo(settings.database_url)
        # Open explicitly; don't rely on implicit open or non-existent flags.
        _pool = AsyncConnectionPool(conninfo, min_size=1, max_size=10, open=False)
        await _pool.open(wait=True)  # wait until min_size connections are ready
    return _pool

@asynccontextmanager
async def db_conn():
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            yield conn, cur

async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
