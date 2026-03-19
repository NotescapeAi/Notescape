import os
import sys
import pytest
import asyncio
from uuid import uuid4
from datetime import datetime

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
from app.core.db import db_conn, get_pool, is_db_available
from app.routers.chat_sessions import add_messages, ChatMessageCreate, create_session, ChatSessionCreate

# Test Data Setup
USER_ID = f"test_user_persist_{str(uuid4())[:8]}"
CLASS_NAME = f"Test Class Persistence {str(uuid4())[:8]}"

async def setup_test_data():
    """
    Creates a class and two files for testing.
    Returns (class_id, file_id_A, file_id_B)
    """
    class_id = None
    file_id_A = str(uuid4())
    file_id_B = str(uuid4())
    
    async with db_conn() as (conn, cur):
        # 1. Create Class
        await cur.execute(
            "INSERT INTO classes (name, owner_uid) VALUES (%s, %s) RETURNING id",
            (CLASS_NAME, USER_ID)
        )
        class_id = (await cur.fetchone())[0]
        
        # 2. Create File A
        await cur.execute(
            """
            INSERT INTO files (id, class_id, filename, storage_url, storage_key, storage_backend, mime_type)
            VALUES (%s, %s, 'file_a.pdf', 's3://bucket/key_a', 'key_a', 's3', 'application/pdf')
            """,
            (file_id_A, class_id)
        )

        # 3. Create File B
        await cur.execute(
            """
            INSERT INTO files (id, class_id, filename, storage_url, storage_key, storage_backend, mime_type)
            VALUES (%s, %s, 'file_b.pdf', 's3://bucket/key_b', 'key_b', 's3', 'application/pdf')
            """,
            (file_id_B, class_id)
        )
        
        await conn.commit()
    
    return class_id, file_id_A, file_id_B

async def teardown_test_data(class_id):
    if not class_id:
        return
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE class_id=%s)", (class_id,))
        await cur.execute("DELETE FROM chat_sessions WHERE class_id=%s", (class_id,))
        await cur.execute("DELETE FROM file_chunks WHERE file_id IN (SELECT id FROM files WHERE class_id=%s)", (class_id,))
        await cur.execute("DELETE FROM files WHERE class_id=%s", (class_id,))
        await cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
        await conn.commit()

@pytest.mark.asyncio
async def test_chat_persistence_robustness():
    """
    Comprehensive test for chat message persistence scenarios.
    """
    print(f"\nStarting chat persistence robustness test for user {USER_ID}...")
    await get_pool()
    if not is_db_available():
        pytest.skip("Database not available; skipping chat persistence integration test.")
    
    class_id, file_id_A, file_id_B = await setup_test_data()
    session_id = None
    
    try:
        # 1. Create Chat Session linked to File A
        session_payload = ChatSessionCreate(
            class_id=class_id,
            document_id=file_id_A,
            title="Persistence Test Session"
        )
        session = await create_session(session_payload, USER_ID)
        session_id = session["id"]
        assert session_id is not None
        print(f"Created session {session_id} linked to File A ({file_id_A})")

        # 2. Test: Save Valid Message (matching file scope)
        print("Test 1: Saving valid message (matching file scope)...")
        msg_valid = ChatMessageCreate(
            user_content="Hello File A",
            assistant_content="Hi there",
            file_id=file_id_A
        )
        res_valid = await add_messages(session_id, msg_valid, USER_ID)
        assert res_valid["ok"] is True
        assert len(res_valid["messages"]) >= 1
        print("  -> Success")

        # 3. Test: Save Cross-File Message (mismatched file scope)
        # This was the bug: previously this would fail with 404. Now it should succeed with a warning.
        print("Test 2: Saving cross-file message (mismatched file scope)...")
        msg_cross = ChatMessageCreate(
            user_content="Question about File B while in File A session",
            assistant_content="Sure, let's talk about File B",
            file_id=file_id_B 
        )
        res_cross = await add_messages(session_id, msg_cross, USER_ID)
        assert res_cross["ok"] is True
        # Verify the message actually persisted with file_id_B
        async with db_conn() as (conn, cur):
            await cur.execute(
                "SELECT file_id FROM chat_messages WHERE session_id=%s AND content=%s",
                (session_id, msg_cross.user_content)
            )
            saved_file_id = (await cur.fetchone())[0]
            assert str(saved_file_id) == str(file_id_B)
        print("  -> Success (Message saved despite scope mismatch)")

        # 4. Test: Save Attachment Message
        print("Test 3: Saving message with attachment...")
        msg_attach = ChatMessageCreate(
            user_content="Look at this image from File B",
            assistant_content="Nice image",
            file_id=file_id_B,
            image_attachment={
                "file_id": file_id_B,
                "data_url": "data:image/png;base64,fake",
                "content_type": "image/png"
            }
        )
        res_attach = await add_messages(session_id, msg_attach, USER_ID)
        assert res_attach["ok"] is True
        print("  -> Success")

        # 5. Test: Auto-Title Generation Trigger
        # This implicitly tests the background task logic we added
        print("Test 4: Auto-title generation trigger...")
        # Create a new session with default title
        session_payload_2 = ChatSessionCreate(class_id=class_id, document_id=file_id_A)
        session_2 = await create_session(session_payload_2, USER_ID)
        session_id_2 = session_2["id"]
        
        msg_title = ChatMessageCreate(
            user_content="What is the capital of France?",
            assistant_content="Paris",
            file_id=file_id_A
        )
        # We can't easily verify the title changed instantly because it runs in a threadpool/background,
        # but we can verify the call doesn't crash.
        res_title = await add_messages(session_id_2, msg_title, USER_ID)
        assert res_title["ok"] is True
        print("  -> Success (Title generation triggered without error)")

        # 6. Test: Save Message with INVALID file_id (should be saved with file_id=NULL)
        invalid_file_id = str(uuid4())
        msg_payload_invalid = ChatMessageCreate(
            user_content="This message has an invalid file_id.",
            assistant_content="It should still be saved.",
            file_id=invalid_file_id # Context is INVALID
        )
        try:
            await add_messages(session_id, msg_payload_invalid, USER_ID)
            print("Test 5: Saving message with INVALID file_id... -> Success (handled gracefully)")
        except Exception as e:
            pytest.fail(f"Test 5 Failed: Message with invalid file_id raised exception: {e}")
            
        # Verify the message was saved with file_id=NULL
        async with db_conn() as (conn, cur):
            await cur.execute(
                "SELECT file_id FROM chat_messages WHERE session_id=%s AND content=%s",
                (session_id, "This message has an invalid file_id.")
            )
            row = await cur.fetchone()
            assert row is not None, "Message not found in DB"
            assert row[0] is None, f"Message file_id should be None, got {row[0]}"
            print("Test 5 Verification: Message saved with file_id=NULL -> Verified")

    except Exception as e:
        print(f"TEST FAILED: {e}")
        raise e
    finally:
        print("Cleaning up test data...")
        await teardown_test_data(class_id)

if __name__ == "__main__":
    # Manually run the async test if executed as a script
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_chat_persistence_robustness())
    loop.close()
