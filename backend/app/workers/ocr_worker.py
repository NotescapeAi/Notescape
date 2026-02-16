import os
import time
import json
import tempfile
import subprocess
from datetime import datetime, timezone
from pypdf import PdfReader
from app.core.db import db_conn
from app.core.storage import get_object_bytes, put_bytes
from app.core.cache import cache_set
from app.lib.chunking import extract_page_texts
from app.lib.indexing import index_file
import io
POLL_SECONDS = 2


def now():
    return datetime.now(timezone.utc)


async def fetch_and_claim_job():
    async with db_conn() as (conn, cur):
        await cur.execute("""
            UPDATE ocr_jobs
            SET status='running', started_at=now()
            WHERE id = (
                SELECT id FROM ocr_jobs
                WHERE status='queued'
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, file_id, output_text_key, output_json_key
        """)
        row = await cur.fetchone()
        if row:
            await conn.commit()
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))
    return None


async def get_file_info(file_id):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT storage_key, mime_type FROM files WHERE id=%s",
            (str(file_id),)
        )
        return await cur.fetchone()


def ocr_pdf(pdf_path: str):
    images_dir = os.path.join(os.path.dirname(pdf_path), "pages")
    os.makedirs(images_dir, exist_ok=True)

    subprocess.check_call(
        ["pdftoppm", "-png", pdf_path, os.path.join(images_dir, "page")]
    )

    pages = []
    for name in sorted(os.listdir(images_dir)):
        if not name.endswith(".png"):
            continue
        img_path = os.path.join(images_dir, name)
        text = subprocess.check_output(
            ["tesseract", img_path, "stdout"],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        pages.append({"page": name, "text": text})

    return pages

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    texts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        texts.append(t)
    return "\n".join(texts)

def is_digital_text(text: str, min_chars: int = 200) -> bool:
    return len((text or "").strip()) >= min_chars

async def update_file_status(file_id: str, status: str, error: str | None = None, indexed: bool = False):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status=%s,
                last_error=%s,
                indexed_at=CASE WHEN %s THEN now() ELSE indexed_at END
            WHERE id=%s
            """,
            (status, error, indexed, str(file_id)),
        )
        await conn.commit()
async def run():
    while True:
        # 1) fetch job
        job = await fetch_and_claim_job()
        if not job:
            time.sleep(POLL_SECONDS)
            continue

        job_id = job["id"]

        try:
            # 2) get file info
            info = await get_file_info(job["file_id"])
            if not info:
                raise RuntimeError("File not found")

            storage_key, mime = info

            # 3) download file
            data = get_object_bytes(storage_key)

            # 4) try digital PDF extraction first
            try:
                extracted = extract_text_from_pdf_bytes(data)
            except Exception:
                extracted = ""

            if is_digital_text(extracted):
                # DIGITAL PDF PATH (no OCR)
                put_bytes(
                    job["output_text_key"],
                    extracted.encode("utf-8"),
                    "text/plain; charset=utf-8",
                )

                meta = {
                    "method": "pdf_text",
                    "chars": len(extracted),
                    "note": "extracted using pypdf",
                }

                put_bytes(
                    job["output_json_key"],
                    json.dumps(meta).encode("utf-8"),
                    "application/json",
                )

                async with db_conn() as (conn, cur):
                    await cur.execute(
                        """
                        UPDATE ocr_jobs
                        SET status='done',
                            method='pdf_text',
                            finished_at=now(),
                            error=NULL
                        WHERE id=%s
                        """,
                        (str(job_id),)
                    )
                    await conn.commit()

                cache_set(f"filetext:{job['file_id']}:{storage_key}", extracted.encode("utf-8"), ttl_seconds=86400)

                with tempfile.TemporaryDirectory() as td:
                    pdf_path = os.path.join(td, "input.pdf")
                    with open(pdf_path, "wb") as f:
                        f.write(data)
                    page_texts = extract_page_texts(pdf_path)
                    total = await index_file(str(job["file_id"]), page_texts=page_texts)
                    await update_file_status(job["file_id"], "INDEXED" if total > 0 else "FAILED", indexed=total > 0)

                continue  # IMPORTANT: skip OCR

            # 5) OCR PATH (scanned PDF)
            with tempfile.TemporaryDirectory() as td:
                pdf_path = os.path.join(td, "input.pdf")
                with open(pdf_path, "wb") as f:
                    f.write(data)

                pages = ocr_pdf(pdf_path)
                page_texts = [p.get("text", "") for p in pages]
                full_text = "\n\n".join(page_texts)

                put_bytes(
                    job["output_text_key"],
                    full_text.encode("utf-8"),
                    "text/plain; charset=utf-8",
                )

                put_bytes(
                    job["output_json_key"],
                    json.dumps(pages, ensure_ascii=False).encode("utf-8"),
                    "application/json",
                )

            async with db_conn() as (conn, cur):
                await cur.execute(
                    """
                    UPDATE ocr_jobs
                    SET status='done',
                        method='ocr',
                        finished_at=now(),
                        error=NULL
                    WHERE id=%s
                    """,
                    (str(job_id),)
                )
                await conn.commit()

            await update_file_status(job["file_id"], "OCR_DONE")
            cache_set(f"filetext:{job['file_id']}:{storage_key}", full_text.encode("utf-8"), ttl_seconds=86400)
            total = await index_file(str(job["file_id"]), page_texts=page_texts)
            await update_file_status(job["file_id"], "INDEXED" if total > 0 else "FAILED", indexed=total > 0)

        except Exception as e:
            async with db_conn() as (conn, cur):
                await cur.execute(
                    """
                    UPDATE ocr_jobs
                    SET status='failed',
                        finished_at=now(),
                        error=%s
                    WHERE id=%s
                    """,
                    (str(e), str(job_id)),
                )
                await conn.commit()
            await update_file_status(job["file_id"], "FAILED", error=str(e))


if __name__ == "__main__":
    import asyncio
    asyncio.run(run())
