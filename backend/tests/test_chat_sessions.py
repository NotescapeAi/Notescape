import os
import sys
import pytest
import asyncio
from uuid import uuid4

# Set environment variables for testing
os.environ.setdefault("DATABASE_URL", "postgresql://notescape:notescape_pass@localhost:5434/notescape")
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ.setdefault("UPLOAD_ROOT", ".")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "minioadmin")
os.environ.setdefault("S3_SECRET_KEY", "minioadmin")
os.environ.setdefault("S3_BUCKET", "test-bucket")

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# Import app modules after setting env vars
from app.core.db import db_conn
from app.core.db import get_pool, is_db_available
from app.routers.chat_sessions import list_sessions

async def run_test_chat_session_pdf_filtering():
    """
    Integration test to verify that list_sessions correctly filters by document_id.
    """
    print("Starting chat session PDF filtering verification...")
    await get_pool()
    if not is_db_available():
        pytest.skip("Database not available; skipping chat session integration test.")
    
    user_id = "test_user_pdf_chat_" + str(uuid4())[:8]
    class_name = "Test Class PDF Chat"
    
    class_id = None
    
    try:
        async with db_conn() as (conn, cur):
            # 1. Create Class
            await cur.execute(
                "INSERT INTO classes (name, owner_uid) VALUES (%s, %s) RETURNING id",
                (class_name, user_id)
            )
            class_id = (await cur.fetchone())[0]
            
            # 2. Create File (to serve as document_id)
            file_id = str(uuid4())
            await cur.execute(
                """
                INSERT INTO files (id, class_id, filename, storage_url, storage_key, storage_backend, mime_type)
                VALUES (%s, %s, 'test.pdf', 's3://bucket/key', 'key', 's3', 'application/pdf')
                """,
                (file_id, class_id)
            )
            
            # 3. Create Global Session
            global_session_id = str(uuid4())
            await cur.execute(
                """
                INSERT INTO chat_sessions (id, class_id, user_id, title, document_id)
                VALUES (%s, %s, %s, 'Global Session', NULL)
                """,
                (global_session_id, class_id, user_id)
            )
            
            # 4. Create PDF Session
            pdf_session_id = str(uuid4())
            await cur.execute(
                """
                INSERT INTO chat_sessions (id, class_id, user_id, title, document_id)
                VALUES (%s, %s, %s, 'PDF Session', %s)
                """,
                (pdf_session_id, class_id, user_id, file_id)
            )
            
            await conn.commit()

        # 5. Test Listing - Global Context (document_id=None)
        sessions_global = await list_sessions(class_id=class_id, document_id=None, include_all=False, user_id=user_id)
        found_global_ids = [s["id"] for s in sessions_global]
        
        assert global_session_id in found_global_ids, "Global session NOT found in global list"
        assert pdf_session_id not in found_global_ids, "PDF session found in global list (should be excluded)"

        # 6. Test Listing - PDF Context (document_id=file_id)
        sessions_pdf = await list_sessions(class_id=class_id, document_id=file_id, include_all=False, user_id=user_id)
        found_pdf_ids = [s["id"] for s in sessions_pdf]
        
        assert pdf_session_id in found_pdf_ids, "PDF session NOT found in PDF list"
        assert global_session_id not in found_pdf_ids, "Global session found in PDF list (should be excluded)"

    finally:
        if class_id:
            async with db_conn() as (conn, cur):
                await cur.execute("DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE class_id=%s)", (class_id,))
                await cur.execute("DELETE FROM chat_sessions WHERE class_id=%s", (class_id,))
                await cur.execute("DELETE FROM file_chunks WHERE file_id IN (SELECT id FROM files WHERE class_id=%s)", (class_id,))
                await cur.execute("DELETE FROM files WHERE class_id=%s", (class_id,))
                await cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
                await conn.commit()

def test_chat_session_pdf_filtering():
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_test_chat_session_pdf_filtering())
