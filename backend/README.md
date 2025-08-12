## Backend (FastAPI)

**Requires:** Python 3.11+

### Setup
    python3 -m venv venv && source venv/bin/activate
    pip install -r requirements.txt

### Run (dev)
    uvicorn app.main:app --reload

**Health check:**  
`GET http://127.0.0.1:8000/health`

---

### Tests & Lint
    pip install pytest ruff
    pytest -q
    ruff check .

---

### Environment variables
Create one of: `.env` (local), `.env.staging`, `.env.production`

**Example `.env`:**
