# Notescape

## Getting started (local, docker-compose)

1) Provide secrets locally (not committed):
   - `secrets/serviceAccountKey.json` (Firebase service account)
   - `.env` with `GROQ_API_KEY=...` (and any optional overrides)
2) Validate compose config:
   - `docker-compose config`
3) Build and start:
   - `docker-compose build --no-cache`
   - `docker-compose up -d`
4) Health checks:
   - `http://localhost:8000/health` -> `{ "status": "ok" }`
   - `http://localhost:8000/api/chat/health` -> `{ "chat_model_reply": "..." }`
   - `http://localhost:3000` -> frontend loads

## Migrations (existing DB)

If you already have a persistent `pgdata` volume, apply the latest schema updates:

```
docker exec -i notescape-db psql -U notescape -d notescape < db/init/04_app_updates.sql
```

## Upload + OCR pipeline verification

1) Create a class in the UI and note its `class_id`.
2) Upload a digital PDF:
   - `curl -F "file=@./path/to/digital.pdf" http://localhost:8000/api/files/<CLASS_ID>`
   - Expected JSON includes `status: "INDEXED"` (or briefly `UPLOADED` then `INDEXED` on refresh).
3) Upload a scanned PDF:
   - `curl -F "file=@./path/to/scanned.pdf" http://localhost:8000/api/files/<CLASS_ID>`
   - Expected JSON includes `status: "OCR_QUEUED"` and `ocr_job_id`.
4) Check processing status:
   - `curl http://localhost:8000/api/files/<CLASS_ID>`
   - Expected: scanned file moves `OCR_QUEUED -> OCR_DONE -> INDEXED`.
5) Verify worker logs:
   - `docker logs -f notescape-ocr-worker`
   - Expected lines: `[indexing] indexed file ...` and `method='ocr'` or `method='pdf_text'`.

## Flashcards scoping + SR verification

1) Generate flashcards from a single file (per class):
   - `curl -X POST http://localhost:8000/api/flashcards/generate -H "Content-Type: application/json" -d '{"class_id":1,"file_ids":["<FILE_UUID>"],"top_k":12,"difficulty":"medium"}'`
2) List flashcards for that file:
   - `curl "http://localhost:8000/api/flashcards/1?file_id=<FILE_UUID>"`
   - Expected: only cards for the file, with `file_id` populated.
3) Get due cards:
   - `curl "http://localhost:8000/api/flashcards/due?class_id=1&file_id=<FILE_UUID>"`
4) Submit a review rating:
   - `curl -X POST http://localhost:8000/api/flashcards/<CARD_UUID>/review -H "Content-Type: application/json" -d '{"rating":"good"}'`
5) Run the SM-2 unit check:
   - `python backend/tests/test_sm2.py`
   - Expected: `SM-2 unit checks passed.`

## Chat history persistence

1) Create a session:
   - `curl -X POST http://localhost:8000/api/chat/sessions -H "Content-Type: application/json" -d '{"class_id":1,"title":"Biology review"}'`
2) List sessions:
   - `curl "http://localhost:8000/api/chat/sessions?class_id=1"`
3) Post messages:
   - `curl -X POST http://localhost:8000/api/chat/sessions/<SESSION_UUID>/messages -H "Content-Type: application/json" -d '{"user_content":"What is mitosis?","assistant_content":"...","citations":[]}'`
4) Get a session:
   - `curl "http://localhost:8000/api/chat/sessions/<SESSION_UUID>"`

## Redis cache verification

1) Ask the same question twice:
   - `curl -X POST http://localhost:8000/api/chat/ask -H "Content-Type: application/json" -d '{"class_id":1,"question":"Define entropy","top_k":5}'`
   - Repeat the same command.
2) Inspect cache keys:
   - `docker exec -it notescape-redis redis-cli KEYS "chat:*"`
   - `docker exec -it notescape-redis redis-cli KEYS "emb:*"`
   - `docker exec -it notescape-redis redis-cli KEYS "filetext:*"`

## Security notes

- Secrets are ignored via `.gitignore` and `.dockerignore`.
- Do not commit `.env`, credential JSON, or private keys.
