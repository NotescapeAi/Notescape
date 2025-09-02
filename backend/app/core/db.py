# backend/app/core/db.py
import os
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5432/notescape")
pool = AsyncConnectionPool(DATABASE_URL, min_size=1, max_size=5)

@asynccontextmanager
async def db_conn():
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            yield conn, cur

