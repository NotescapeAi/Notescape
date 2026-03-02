import asyncio
import os
import sys
from uuid import uuid4

# Set environment variables for testing
os.environ["DATABASE_URL"] = "postgresql://notescape:notescape_pass@localhost:5434/notescape"
os.environ["S3_ENDPOINT_URL"] = "http://localhost:9000"
os.environ["S3_ACCESS_KEY"] = "minioadmin"
os.environ["S3_SECRET_KEY"] = "minioadmin"
os.environ["S3_BUCKET"] = "test-bucket"
os.environ["CORS_ORIGINS"] = "*"
os.environ["UPLOAD_ROOT"] = "."

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.core.db import db_conn, close_pool
from app.routers.chunks import create_chunks, ChunkRequest
from fastapi import Request

# Mock Request
class MockRequest:
    class App:
        class State:
            uploads_root = "."
        state = State()
    app = App()

async def main():
    print("Starting chunk verification...")
    
    # 1. Setup dummy data
    user_id = "test_user_chunk_verif"
    class_name = "Test Class Chunk Verif"
    filename = "test_doc_chunk.pdf"
    
    # Create a dummy PDF file (we can't easily create a valid PDF binary here without libraries, 
    # so we will mock the PDF reading part or insert a fake file entry and skip actual file reading if possible,
    # BUT create_chunks reads the file.
    # So we will rely on a trick: we will create a file entry with 'storage_backend'='s3' but invalid key,
    # and hope create_chunks fails gracefully? No, we need it to succeed to check chunks.
    
    # Better: We will mock `_read_pdf_pages` or `_read_pdf_pages_from_bytes` in `app.routers.chunks`.
    # We can use `unittest.mock` to patch it.
    
    from unittest.mock import patch
    
    async with db_conn() as (conn, cur):
        # Create class
        await cur.execute(
            "INSERT INTO classes (name, owner_uid) VALUES (%s, %s) RETURNING id",
            (class_name, user_id)
        )
        class_id = (await cur.fetchone())[0]
        
        # Create file
        file_id = str(uuid4())
        await cur.execute(
            """
            INSERT INTO files (id, class_id, filename, storage_url, storage_key, storage_backend, mime_type)
            VALUES (%s, %s, %s, 's3://bucket/test-key', 'test-key', 's3', 'application/pdf')
            """,
            (file_id, class_id, filename)
        )
        await conn.commit()

    try:
        # Mock PDF reading to return 3 pages of text
        with patch("app.routers.chunks.get_object_bytes") as mock_get_bytes, \
             patch("app.routers.chunks._read_pdf_pages_from_bytes") as mock_read_pdf:
            
            mock_get_bytes.return_value = b"fake pdf content"
            # Page 1 has 1000 chars, Page 2 has 500 chars, Page 3 has 1000 chars
            mock_read_pdf.return_value = ["A" * 1000, "B" * 500, "C" * 1000]
            
            # Call create_chunks with 'auto' mode
            req = ChunkRequest(
                file_ids=[file_id],
                by="auto",
                size=800,
                overlap=100
            )
            
            await create_chunks(req, MockRequest())
            
            # Check database for chunks
            async with db_conn() as (conn, cur):
                await cur.execute(
                    "SELECT idx, page_start, page_end, chunk_vector FROM file_chunks WHERE file_id=%s ORDER BY idx",
                    (file_id,)
                )
                rows = await cur.fetchall()
                
                print(f"Found {len(rows)} chunks.")
                for row in rows:
                    idx, p_start, p_end, vec = row
                    print(f"Chunk {idx}: Page {p_start}-{p_end}, Vector: {'Present' if vec else 'NULL'}")
                    
                    if p_start is None or p_end is None:
                        print("FAILURE: Page numbers are NULL!")
                    if vec is None:
                        print("FAILURE: Vector is NULL!")

    finally:
        # Cleanup
        async with db_conn() as (conn, cur):
            await cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
            await conn.commit()
        await close_pool()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
