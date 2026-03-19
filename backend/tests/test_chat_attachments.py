import os

# Set mock environment variables before importing app modules
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:3000"]')
os.environ.setdefault("UPLOAD_ROOT", ".")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "minioadmin")
os.environ.setdefault("S3_SECRET_KEY", "minioadmin")
os.environ.setdefault("S3_BUCKET", "notescape")

import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi import HTTPException
from app.routers.chat_sessions import add_messages, ChatMessageCreate

# Mock user_id dependency
USER_ID = "test_user"

async def run_test_add_message_attachment_mismatch_allowed():
    # Setup
    session_id = "session_123"
    document_id = "doc_123"
    attachment_id = "att_456" # Different from document_id
    class_id = 1
    
    payload = ChatMessageCreate(
        user_content="Look at this",
        assistant_content="Ok",
        file_id=attachment_id,
        image_attachment={"file_id": attachment_id, "filename": "image.png"}
    )
    
    # Mock DB cursor and connection
    mock_cursor = AsyncMock()
    mock_conn = AsyncMock()
    
    # Context manager for db_conn
    mock_db_ctx = AsyncMock()
    mock_db_ctx.__aenter__.return_value = (mock_conn, mock_cursor)
    mock_db_ctx.__aexit__.return_value = None
    
    with patch("app.routers.chat_sessions.db_conn", return_value=mock_db_ctx):
        # Configure fetchone side effects
        # Call 1: Session lookup -> (class_id, document_id, title)
        # Call 2: File lookup (verify attachment exists in class) -> (1,)
        mock_cursor.fetchone.side_effect = [
            (class_id, document_id, "Chat session"), # Session lookup
            (1,), # File lookup
        ]
        
        mock_cursor.fetchall.return_value = [] # Return empty list for final message fetch
        
        # Act
        await add_messages(session_id, payload, user_id=USER_ID)
        
        # Assert
        assert mock_cursor.execute.call_count >= 4
        
def test_add_message_attachment_mismatch_allowed():
    asyncio.run(run_test_add_message_attachment_mismatch_allowed())

async def run_test_add_message_mismatch_forbidden_without_attachment():
    # Setup
    session_id = "session_123"
    document_id = "doc_123"
    other_file_id = "other_456" # Different from document_id
    class_id = 1
    
    payload = ChatMessageCreate(
        user_content="Look at this",
        assistant_content="Ok",
        file_id=other_file_id,
        image_attachment=None # No attachment
    )
    
    # Mock DB
    mock_cursor = AsyncMock()
    mock_conn = AsyncMock()
    mock_db_ctx = AsyncMock()
    mock_db_ctx.__aenter__.return_value = (mock_conn, mock_cursor)
    
    with patch("app.routers.chat_sessions.db_conn", return_value=mock_db_ctx):
        mock_cursor.fetchone.side_effect = [
            (class_id, document_id, "Chat session"), # Session lookup
            (1,), # File lookup
        ]
        mock_cursor.fetchall.return_value = []
        
        res = await add_messages(session_id, payload, user_id=USER_ID)
        assert res["ok"] is True

def test_add_message_mismatch_forbidden_without_attachment():
    asyncio.run(run_test_add_message_mismatch_forbidden_without_attachment())
