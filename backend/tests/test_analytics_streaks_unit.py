import pytest
import uuid
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.db import db_conn, get_pool
from app.dependencies import get_request_user_uid

@pytest.mark.asyncio
async def test_analytics_streaks_comprehensive():
    from app.core.settings import settings
    print(f"DATABASE_URL: {settings.database_url}")
    
    # Ensure DB pool is initialized
    await get_pool()
    
    user_id = f"test_streak_{uuid.uuid4().hex[:8]}"
    
    # Override auth to use our test user
    app.dependency_overrides[get_request_user_uid] = lambda: user_id
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Initial check: 0 streak
        # Note: Depending on mock data in degraded mode, this might be non-zero if DB is down.
        # But we assume DB is up for tests.
        resp = await ac.get("/api/analytics/streaks")
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_streak"] == 0
        
        async with db_conn() as (conn, cur):
            # 2. Insert Study Session (Today)
            today = date.today()
            # Ensure we use a timestamp for started_at
            await cur.execute(
                "INSERT INTO study_sessions (user_id, started_at, active_seconds) VALUES (%s, %s, 60)",
                (user_id, today)
            )
            
        resp = await ac.get("/api/analytics/streaks")
        assert resp.status_code == 200
        assert resp.json()["current_streak"] == 1
        
        async with db_conn() as (conn, cur):
            # 3. Insert File Upload (Yesterday)
            yesterday = today - timedelta(days=1)
            
            # Create Class first
            await cur.execute(
                "INSERT INTO classes (name, owner_uid, created_at) VALUES ('Test Class', %s, %s) RETURNING id",
                (user_id, yesterday)
            )
            class_id = (await cur.fetchone())[0]
            
            # Create File
            await cur.execute(
                "INSERT INTO files (class_id, filename, storage_url, uploaded_at) VALUES (%s, 'test.pdf', 's3://test', %s) RETURNING id",
                (class_id, yesterday)
            )
            file_id = (await cur.fetchone())[0]
            
        resp = await ac.get("/api/analytics/streaks")
        assert resp.json()["current_streak"] == 2
        
        async with db_conn() as (conn, cur):
            # 4. Insert Quiz Attempt (Day before yesterday)
            day_before = today - timedelta(days=2)
            
            # Create Quiz
            await cur.execute(
                "INSERT INTO quizzes (class_id, file_id, title) VALUES (%s, %s, 'Test Quiz') RETURNING id",
                (class_id, file_id)
            )
            quiz_id = (await cur.fetchone())[0]
            
            # Create Attempt
            await cur.execute(
                "INSERT INTO quiz_attempts (quiz_id, user_id, started_at, status) VALUES (%s, %s, %s, 'submitted')",
                (quiz_id, user_id, day_before)
            )
            
        resp = await ac.get("/api/analytics/streaks")
        assert resp.json()["current_streak"] == 3
