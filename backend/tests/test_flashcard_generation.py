import asyncio
import httpx
import time
import json
import io
from reportlab.pdfgen import canvas

API_URL = "http://localhost:8000/api"
HEADERS = {"X-User-Id": "dev-user"}

def create_valid_pdf_bytes():
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Hello World Test Flashcard Generation")
    c.save()
    buffer.seek(0)
    return buffer.read()

PDF_CONTENT = create_valid_pdf_bytes()

async def run_test():
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as client:
        # 1. Create Class
        print("Creating class...")
        r = await client.post("/classes", json={"name": "Flashcard Test Class"}, headers=HEADERS)
        if r.status_code != 200:
            print(f"Failed to create class: {r.text}")
            return
        class_id = r.json()["id"]
        print(f"Class created: {class_id}")

        # 2. Upload File
        print("Uploading file...")
        files = {"file": ("test_flashcard.pdf", PDF_CONTENT, "application/pdf")}
        r = await client.post(f"/files/{class_id}", files=files, headers=HEADERS)
        if r.status_code != 200:
            print(f"Failed to upload file: {r.text}")
            return
        file_id = r.json()["id"]
        print(f"File uploaded: {file_id}")

        # 3. Wait for File to be INDEXED
        print("Waiting for file indexing...")
        indexed = False
        for _ in range(20):  # Wait up to 20 seconds
            # FIX: The correct endpoint to list files is /files/{class_id}
            r = await client.get(f"/files/{class_id}", headers=HEADERS)
            if r.status_code != 200:
                 print(f"Failed to list files: {r.status_code} {r.text}")
                 await asyncio.sleep(1)
                 continue
            
            file_list = r.json()
            # Find our file
            f_obj = next((f for f in file_list if f["id"] == file_id), None)
            if f_obj:
                print(f"File status: {f_obj['status']}")
                if f_obj["status"] == "INDEXED":
                    indexed = True
                    break
                if f_obj["status"] == "FAILED":
                    print(f"File processing failed: {f_obj.get('last_error')}")
                    return
            await asyncio.sleep(1)
        
        if not indexed:
            print("Timeout waiting for file to be INDEXED")
            return

        # 4. Generate Flashcards
        print("Generating flashcards...")
        payload = {
            "class_id": class_id,
            "file_ids": [file_id],
            "topic": "General Knowledge",
            "style": "mixed",
            "n_cards": 5
        }
        r = await client.post("/flashcards/generate", json=payload, headers=HEADERS)
        if r.status_code != 200:
            print(f"Failed to start generation: {r.text}")
            return
        job_data = r.json()
        job_id = job_data["job_id"]
        print(f"Job started: {job_id}")

        # 5. Poll Job Status
        print("Polling job status...")
        completed = False
        for _ in range(60):  # Wait up to 60 seconds
            r = await client.get(f"/flashcards/job_status/{job_id}", headers=HEADERS)
            job = r.json()
            status = job["status"]
            print(f"Job status: {status}, Progress: {job.get('progress')}%")
            
            if status == "completed":
                completed = True
                break
            if status == "failed":
                print(f"Job failed: {job.get('error_message')}")
                return
            
            await asyncio.sleep(1)
            
        if completed:
            print("SUCCESS: Flashcard generation completed!")
            # Optionally list flashcards
            r = await client.get(f"/flashcards/{class_id}", headers=HEADERS)
            cards = r.json()
            print(f"Generated {len(cards)} flashcards.")
        else:
            print("Timeout waiting for job completion")

if __name__ == "__main__":
    asyncio.run(run_test())
