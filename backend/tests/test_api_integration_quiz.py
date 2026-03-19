import time
import uuid
import httpx
import os
import pytest

# Base URL for the running API
API_BASE = os.environ.get("API_BASE_URL", "http://localhost:8000/api")

# Only run if explicitly requested or environment variable set
# because this requires a running backend and worker
@pytest.mark.skipif(
    not os.environ.get("RUN_INTEGRATION_TESTS"),
    reason="Skipping integration tests requiring running backend"
)
def test_quiz_lifecycle_e2e():
    # Setup client
    client = httpx.Client(base_url=API_BASE, timeout=30.0)
    
    # 1. Create Class
    # Use dev-user header
    headers = {"X-User-Id": "dev-user"}
    
    unique_suffix = str(uuid.uuid4())[:8]
    class_name = f"Integration Test Class {unique_suffix}"
    
    resp = client.post("/classes", json={"name": class_name}, headers=headers)
    assert resp.status_code == 200, f"Create class failed: {resp.text}"
    class_data = resp.json()
    class_id = class_data["id"]
    print(f"Created Class: {class_id}")

    try:
        # 2. Upload File
        # Try to find a real PDF to ensure text extraction works
        file_content = None
        pdf_path = None
        
        # Search for a PDF in uploads directory
        uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
        for root, dirs, files_list in os.walk(uploads_dir):
            for f in files_list:
                if f.endswith(".pdf"):
                    pdf_path = os.path.join(root, f)
                    break
            if pdf_path:
                break
        
        if pdf_path:
            print(f"Using real PDF: {pdf_path}")
            with open(pdf_path, "rb") as f:
                file_content = f.read()
        else:
            print("Using dummy PDF (might fail text extraction)")
            file_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n223\n%%EOF"
        
        files = {'file': ('test.pdf', file_content, 'application/pdf')}
        resp = client.post(f"/files/{class_id}", files=files, headers=headers)
        assert resp.status_code == 200, f"Upload file failed: {resp.text}"
        file_data = resp.json()
        file_id = file_data["id"]
        print(f"Uploaded File: {file_id}")

        # Wait for file processing (INDEXED or OCR_DONE)
        file_ready = False
        for _ in range(30): # 30 seconds wait for processing
            resp = client.get(f"/files/{class_id}", headers=headers)
            files_list = resp.json()
            target_file = next((f for f in files_list if f["id"] == file_id), None)
            
            if target_file:
                status = target_file.get('status')
                print(f"File Status: {status}")
                if status in ["INDEXED", "OCR_DONE"]:
                    file_ready = True
                    break
                if status == "FAILED":
                    print(f"File processing failed: {target_file.get('last_error')}")
                    break
            time.sleep(1)
            
        if not file_ready:
             print("Warning: File processing did not complete in time or failed. Quiz generation might fail.")

        # 3. Create Quiz Job
        payload = {
        "class_id": class_id,
        "file_id": file_id,
        "n_questions": 5,
        "mcq_count": 2,
        "types": ["mcq", "conceptual"],
        "difficulty": "medium",
        "source_type": "file"
    }
        resp = client.post("/quizzes/jobs", json=payload, headers=headers)
        assert resp.status_code == 200, f"Create quiz job failed: {resp.text}"
        job_data = resp.json()
        job_id = job_data["job_id"]
        print(f"Created Job: {job_id}")

        # 4. Poll for Completion
        final_status = None
        for _ in range(30): # 60 seconds
            resp = client.get(f"/quizzes/jobs/{job_id}", headers=headers)
            assert resp.status_code == 200
            status_data = resp.json()
            status = status_data["status"]
            print(f"Job Status: {status}")
            
            if status == "completed":
                final_status = "completed"
                break
            if status == "failed":
                final_status = "failed"
                print(f"Job Error: {status_data.get('error_message')}")
                break
            
            time.sleep(2)
        
        assert final_status == "completed", "Quiz generation did not complete successfully"

        # 5. List Quizzes
        resp = client.get(f"/quizzes?class_id={class_id}", headers=headers)
        assert resp.status_code == 200
        quizzes = resp.json()
        assert len(quizzes) > 0, "No quizzes found after generation"
        
        quiz = quizzes[0]
        print(f"Found Quiz: {quiz['id']} - {quiz['title']}")
        
        # 6. Get Quiz Details
        resp = client.get(f"/quizzes/{quiz['id']}", headers=headers)
        assert resp.status_code == 200
        detail = resp.json()
        items = detail["items"]
        assert len(items) > 0, "Quiz has no questions"
        print(f"Quiz Items: {len(items)}")

    finally:
        # Cleanup
        # Delete class (should cascade delete files/quizzes if impl)
        # client.delete(f"/classes/{class_id}", headers=headers)
        pass

@pytest.mark.skipif(
    not os.environ.get("RUN_INTEGRATION_TESTS"),
    reason="Skipping integration tests requiring running backend"
)
def test_quiz_topic_e2e():
    # Setup client
    client = httpx.Client(base_url=API_BASE, timeout=30.0)
    
    # 1. Create Class
    headers = {"X-User-Id": "dev-user"}
    unique_suffix = str(uuid.uuid4())[:8]
    class_name = f"Integration Test Topic Class {unique_suffix}"
    
    resp = client.post("/classes", json={"name": class_name}, headers=headers)
    assert resp.status_code == 200, f"Create class failed: {resp.text}"
    class_data = resp.json()
    class_id = class_data["id"]
    print(f"Created Class: {class_id}")

    try:
        # 2. Upload Topic Placeholder File
        topic_content = "Ancient Rome History"
        filename = "Topic-Ancient_Rome_History.txt"
        files = {"file": (filename, topic_content, "text/plain")}
        
        resp = client.post(f"/files/{class_id}", files=files, headers=headers)
        assert resp.status_code == 200, f"Upload topic file failed: {resp.text}"
        file_data = resp.json()
        file_id = file_data["id"]
        print(f"Uploaded Topic File: {file_id}")
        
        # Wait for file processing (should be fast for txt)
        time.sleep(2)
        
        # 3. Create Quiz Job with source_type="topic"
        payload = {
            "class_id": class_id,
            "file_id": file_id,
            "n_questions": 5,
            "mcq_count": 2,
            "types": ["mcq", "conceptual"],
            "difficulty": "medium",
            "source_type": "topic"
        }
        
        print(f"Creating Quiz Job for Topic...")
        resp = client.post("/quizzes/jobs", json=payload, headers=headers)
        assert resp.status_code == 200, f"Create quiz job failed: {resp.text}"
        job_data = resp.json()
        job_id = job_data["job_id"]
        print(f"Created Job: {job_id}")

        # 4. Poll for Completion
        final_status = None
        for _ in range(30): # 60 seconds
            resp = client.get(f"/quizzes/jobs/{job_id}", headers=headers)
            assert resp.status_code == 200
            status_data = resp.json()
            status = status_data["status"]
            print(f"Job Status: {status}")
            
            if status == "completed":
                final_status = "completed"
                break
            if status == "failed":
                final_status = "failed"
                print(f"Job Error: {status_data.get('error_message')}")
                break
            
            time.sleep(2)
        
        assert final_status == "completed", "Topic Quiz generation did not complete successfully"

        # 5. List Quizzes
        resp = client.get(f"/quizzes?class_id={class_id}", headers=headers)
        assert resp.status_code == 200
        quizzes = resp.json()
        assert len(quizzes) > 0, "No quizzes found after generation"
        
        quiz = quizzes[0]
        print(f"Found Quiz: {quiz['id']} - {quiz['title']}")
        
        # 6. Get Quiz Details
        resp = client.get(f"/quizzes/{quiz['id']}", headers=headers)
        assert resp.status_code == 200
        detail = resp.json()
        items = detail["items"]
        assert len(items) > 0, "Quiz has no questions"
        print(f"Quiz Items: {len(items)}")

    finally:
        pass

if __name__ == "__main__":
    # Allow running directly as a script
    os.environ["RUN_INTEGRATION_TESTS"] = "1"
    test_quiz_lifecycle_e2e()
    test_quiz_topic_e2e()
