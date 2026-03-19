import os
import pytest
from uuid import uuid4

# Set dummy env vars BEFORE importing app modules
os.environ["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/db"
os.environ["CORS_ORIGINS"] = "*"
os.environ["UPLOAD_ROOT"] = "/tmp"
os.environ["S3_ENDPOINT_URL"] = "http://localhost:9000"
os.environ["S3_ACCESS_KEY"] = "minioadmin"
os.environ["S3_SECRET_KEY"] = "minioadmin"
os.environ["S3_BUCKET"] = "test-bucket"
os.environ["OPENAI_API_KEY"] = "sk-dummy"

# Now import app modules
from app.routers.quizzes import CreateQuizJobReq
from app.workers.quiz_worker import _build_prompt

def test_create_quiz_job_req_defaults():
    req = CreateQuizJobReq(
        class_id=1,
        file_id=uuid4(),
        n_questions=10
    )
    assert req.source_type == "file"
    assert req.types == ["mcq", "conceptual"]

def test_create_quiz_job_req_topic_source():
    req = CreateQuizJobReq(
        class_id=1,
        file_id=uuid4(),
        n_questions=10,
        source_type="topic"
    )
    assert req.source_type == "topic"

def test_build_prompt_topic_instructions():
    chunks = [{"chunk_id": 1, "text": "Photosynthesis is the process...", "page_start": 1, "page_end": 1}]
    prompt = _build_prompt(
        chunks=chunks,
        n_questions=5,
        mcq_count=2,
        types=["mcq", "conceptual"],
        difficulty="medium",
        source_type="topic"
    )
    
    assert "The user has provided a TOPIC" in prompt
    assert "Generate an educational quiz based on this TOPIC using your general knowledge" in prompt
    assert "STRICTLY based on the provided context" not in prompt

def test_build_prompt_file_instructions():
    chunks = [{"chunk_id": 1, "text": "Photosynthesis is the process...", "page_start": 1, "page_end": 1}]
    prompt = _build_prompt(
        chunks=chunks,
        n_questions=5,
        mcq_count=2,
        types=["mcq", "conceptual"],
        difficulty="medium",
        source_type="file"
    )
    
    assert "The user has provided a TOPIC" not in prompt
    assert "STRICTLY based on the provided context" in prompt
