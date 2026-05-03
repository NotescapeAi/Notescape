## Backend (FastAPI)

**Requires:** Python 3.11+

**Office previews (PPTX / DOCX):** install [LibreOffice](https://www.libreoffice.org/) so `soffice` or `libreoffice` is on your `PATH`. The API converts uploads to a cached PDF under the uploads `previews/` directory. Verify with:

    soffice --version

The Docker image installs LibreOffice for you.

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
