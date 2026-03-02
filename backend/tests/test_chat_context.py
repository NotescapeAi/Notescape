import os

# Set mock environment variables before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:3000"]')
os.environ.setdefault("UPLOAD_ROOT", ".")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "minioadmin")
os.environ.setdefault("S3_SECRET_KEY", "minioadmin")
os.environ.setdefault("S3_BUCKET", "notescape")

import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from app.routers.chat import ask, ChatAskReq, ChatMessage

# Mock user_id dependency
USER_ID = "test_user"

async def run_test_ask_without_history():
    # Setup
    req = ChatAskReq(
        class_id=1,
        question="What is X?",
        messages=None
    )
    
    mock_embedder = MagicMock()
    
    # Patch dependencies
    with patch("app.routers.chat.get_embedder", return_value=mock_embedder), \
         patch("app.routers.chat.embed_texts_cached", new_callable=AsyncMock) as mock_embed, \
         patch("app.routers.chat._retrieve_chunks", new_callable=AsyncMock) as mock_retrieve, \
         patch("app.routers.chat.chat_completion", new_callable=MagicMock) as mock_chat, \
         patch("app.routers.chat.cache_get_json", return_value=None), \
         patch("app.routers.chat.cache_set_json"):
         
        # Mock embedding return
        mock_embed.return_value = [[0.1, 0.2, 0.3]]
        
        # Mock retrieval return
        mock_retrieve.return_value = [
            ("chunk1", "Content about X", 1, 1, "file1", "doc.pdf")
        ]
        
        # Mock chat completion return
        mock_chat.return_value = "Answer about X"
        
        # Act
        await ask(req, user_id=USER_ID)
        
        # Assert
        # Verify chat_completion was called once (for answer)
        assert mock_chat.call_count == 1
        
        # Verify prompt contains original question
        args, _ = mock_chat.call_args
        user_prompt = args[1]
        assert "Question:\nWhat is X?" in user_prompt

def test_ask_without_history():
    asyncio.run(run_test_ask_without_history())

async def run_test_ask_with_history_rewrites_question():
    # Setup
    req = ChatAskReq(
        class_id=1,
        question="What about Y?",
        messages=[
            ChatMessage(role="user", content="What is X?"),
            ChatMessage(role="assistant", content="X is a letter.")
        ]
    )
    
    mock_embedder = MagicMock()
    
    with patch("app.routers.chat.get_embedder", return_value=mock_embedder), \
         patch("app.routers.chat.embed_texts_cached", new_callable=AsyncMock) as mock_embed, \
         patch("app.routers.chat._retrieve_chunks", new_callable=AsyncMock) as mock_retrieve, \
         patch("app.routers.chat.chat_completion", new_callable=MagicMock) as mock_chat, \
         patch("app.routers.chat.cache_get_json", return_value=None), \
         patch("app.routers.chat.cache_set_json"):
         
        # Mock embedding return
        mock_embed.return_value = [[0.1, 0.2, 0.3]]
        
        # Mock retrieval return
        mock_retrieve.return_value = [
            ("chunk1", "Content about Y", 1, 1, "file1", "doc.pdf")
        ]
        
        # Mock chat completion side effects
        # Call 1: Rewrite question -> "What is Y in context of X?"
        # Call 2: Generate answer
        mock_chat.side_effect = [
            "What is Y in context of X?", # Rewrite result
            "Answer about Y" # Final answer
        ]
        
        # Act
        await ask(req, user_id=USER_ID)
        
        # Assert
        # Verify chat_completion was called twice
        assert mock_chat.call_count == 2
        
        # Verify first call was for rewriting
        args1, _ = mock_chat.call_args_list[0]
        assert "rephrase the follow up question" in args1[0]
        assert "What about Y?" in args1[1]
        
        # Verify embedding was called with REWRITTEN question
        mock_embed.assert_called_with(mock_embedder, ["What is Y in context of X?"])
        
        # Verify second call was for answer with REWRITTEN question
        args2, _ = mock_chat.call_args_list[1]
        user_prompt = args2[1]
        assert "Question:\nWhat is Y in context of X?" in user_prompt

def test_ask_with_history_rewrites_question():
    asyncio.run(run_test_ask_with_history_rewrites_question())

