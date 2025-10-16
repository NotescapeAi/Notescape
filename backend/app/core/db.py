from contextlib import asynccontextmanager
from typing import Optional
from psycopg_pool import AsyncConnectionPool
from app.core.settings import settings

_pool: Optional[AsyncConnectionPool] = None

def _normalize_conninfo(url: str) -> str:
    """Normalize the database connection string for psycopg_pool."""
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url.split("://", 1)[1]
    return url

async def get_pool() -> AsyncConnectionPool:
    """Return the database connection pool."""
    global _pool
    if _pool is None:
        conninfo = _normalize_conninfo(settings.database_url)
        # Ensure the pool is open during initialization
        _pool = AsyncConnectionPool(conninfo, min_size=1, max_size=10, open=True)
        await _pool.open(wait=True)  # Wait until connections are ready
    return _pool

@asynccontextmanager
async def db_conn():
    """Context manager for handling database connections."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            yield conn, cur

async def close_pool():
    """Cleanly close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
