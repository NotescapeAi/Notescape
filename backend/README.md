## Backend (FastAPI)
- Create venv: `python3 -m venv venv && source venv/bin/activate`
- Install: `pip install -r requirements.txt`
- Run: `uvicorn app.main:app --reload`
- Health check: `GET http://127.0.0.1:8000/health`
