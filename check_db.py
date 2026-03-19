
import psycopg
import sys

DB_URL = "postgresql://postgres:postgres@localhost:5432/notescape"

def check_db():
    print(f"Connecting to {DB_URL}...")
    try:
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                print(cur.fetchone())
        print("Success!")
    except Exception as e:
        print(f"Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    check_db()
