import logging
from contextlib import asynccontextmanager
from typing import Optional
from psycopg_pool import AsyncConnectionPool
from app.core.settings import settings

log = logging.getLogger("uvicorn.error")

_pool: Optional[AsyncConnectionPool] = None

class DummyConnection:
    async def __aenter__(self):
        raise RuntimeError("Database is not available (connection failed at startup)")
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

class DummyPool:
    def connection(self):
        return DummyConnection()
    async def open(self, wait=True):
        pass
    async def close(self):
        pass

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
        try:
            # Ensure the pool is open during initialization
            _pool = AsyncConnectionPool(conninfo, min_size=1, max_size=10, open=False)
            await _pool.open(wait=True)  # Wait until connections are ready
        except Exception as e:
            log.error(f"Failed to connect to database: {e}. Running in degraded mode.")
            _pool = DummyPool() # type: ignore
    return _pool

def is_db_available() -> bool:
    """Check if the database is available."""
    global _pool
    return _pool is not None and not isinstance(_pool, DummyPool)

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
