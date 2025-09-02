# backend/app/core/db.py
import os
import psycopg
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
from app.core.settings import settings

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5432/notescape")
pool = AsyncConnectionPool(DATABASE_URL, min_size=1, max_size=5)

@asynccontextmanager
async def db_conn():
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            yield conn, cur

