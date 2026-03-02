import psycopg
import uuid
import time
import json
import os

# DB Connection
DB_DSN = os.environ.get("DATABASE_URL", "postgresql://notescape:notescape_pass@localhost:5434/notescape")

def main():
    try:
        conn = psycopg.connect(DB_DSN, autocommit=True)
        with conn.cursor() as cur:
            # 1. Use standard dev user
            user_id = "dev-user"
            print(f"Using User ID: {user_id}")
            
            # 2. Check for 'hello' class or reuse 'Test Class Quiz'
            class_id = None
            cur.execute("SELECT id FROM classes WHERE owner_uid = %s AND name = %s", (user_id, "hello"))
            row = cur.fetchone()
            if row:
                class_id = row[0]
                print(f"Using existing 'hello' Class ID: {class_id}")
            else:
                cur.execute("SELECT id FROM classes WHERE owner_uid = %s AND name = %s", (user_id, "Test Class Quiz"))
                row = cur.fetchone()
                if row:
                    class_id = row[0]
                    print(f"Using existing 'Test Class Quiz' ID: {class_id}")
                else:
                    cur.execute("INSERT INTO classes (name, owner_uid) VALUES (%s, %s) RETURNING id", ("Test Class Quiz", user_id))
                    class_id = cur.fetchone()[0]
                    print(f"Created Class ID: {class_id}")

            # 3. Create File (Always create a new one for test, or reuse?)
            # Reusing avoids clutter.
            cur.execute("SELECT id FROM files WHERE class_id = %s AND filename = %s", (class_id, "test_quiz.pdf"))
            row = cur.fetchone()
            if row:
                file_id = row[0]
                print(f"Using existing File ID: {file_id}")
            else:
                file_id = uuid.uuid4()
                cur.execute(
                    "INSERT INTO files (id, class_id, filename, size_bytes, mime_type, status, storage_url) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (file_id, class_id, "test_quiz.pdf", 12345, "application/pdf", "ready", "s3://dummy/path")
                )
                print(f"Created File ID: {file_id}")
                
                # Create Dummy Chunks
                cur.execute(
                    "INSERT INTO file_chunks (file_id, idx, content, char_len) VALUES (%s, 0, 'This is a test chunk content for quiz generation.', 40)",
                    (file_id,)
                )
                print("Created Dummy Chunk")

            # 4. Create Quiz Job
            job_id = uuid.uuid4()
            payload = {
                "n_questions": 5,
                "mcq_count": 2,
                "types": ["mcq", "conceptual"],
                "difficulty": "medium"
            }
            cur.execute(
                """
                INSERT INTO quiz_jobs (id, user_id, class_id, file_id, status, progress, payload)
                VALUES (%s, %s, %s, %s, 'queued', 0, %s)
                """,
                (job_id, user_id, class_id, file_id, json.dumps(payload))
            )
            print(f"Created Job ID: {job_id}")

            # 5. Poll for completion
            print("Waiting for job completion...")
            for _ in range(30): # Wait up to 60 seconds
                # Check status
                cur.execute("SELECT status, progress, error_message FROM quiz_jobs WHERE id = %s", (job_id,))
                status, progress, error = cur.fetchone()
                print(f"Status: {status}, Progress: {progress}%")
                
                if status == 'completed':
                    print("Job Completed!")
                    break
                if status == 'failed':
                    print(f"Job Failed: {error}")
                    break
                time.sleep(2)
            else:
                print("Timeout waiting for job.")
                return

            # 6. Verify Quiz Created
            cur.execute("SELECT id, title FROM quizzes WHERE file_id = %s ORDER BY created_at DESC LIMIT 1", (file_id,))
            quiz = cur.fetchone()
            if quiz:
                print(f"Quiz Created: {quiz[0]} - {quiz[1]}")
                
                # Verify Questions
                cur.execute("SELECT count(*) FROM quiz_questions WHERE quiz_id = %s", (quiz[0],))
                count = cur.fetchone()[0]
                print(f"Questions Count: {count}")
            else:
                print("No quiz found in quizzes table!")

        conn.close()

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
