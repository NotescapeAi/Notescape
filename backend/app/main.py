# app/main.py
from pathlib import Path
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.routing import APIRoute

from app.core.settings import settings

# Routers
from app.routers.classes import router as classes_router
from app.routers.files import router as files_router
from app.routers.chunks import router as chunks_router
from app.routers.contact import router as contact_router
from app.routers.embeddings import router as embeddings_router
from app.routers.flashcards import router as flashcards_router
from app.routers import sr
from app.routers.chat_health import router as chat_health_router
from app.routers.chat import router as chat_router
from app.routers.chat_sessions import router as chat_sessions_router
from app.routers import subscribe



app = FastAPI(title=settings.api_title)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()] or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- uploads location ---
backend_dir = Path(__file__).resolve().parents[1]   # .../backend
proj_root   = backend_dir.parent                    # .../Notescape
uploads_dir = Path(settings.upload_root).resolve() if settings.upload_root else (proj_root / "uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
app.state.uploads_root = uploads_dir
logging.getLogger("uvicorn.error").info(f"[main] uploads_root = {uploads_dir}")

@app.get("/health")
async def health():
    return {"status": "ok"}

# Routers (all already prefixed internally)
app.include_router(classes_router)
app.include_router(files_router)
app.include_router(contact_router)
app.include_router(chunks_router)
app.include_router(embeddings_router)
app.include_router(flashcards_router)
app.include_router(sr.router)

app.include_router(subscribe.router)

app.include_router(chat_health_router)
app.include_router(chat_router)
app.include_router(chat_sessions_router)

@app.on_event("startup")
async def show_routes():
    log = logging.getLogger("uvicorn.error")
    for r in app.routes:
        if isinstance(r, APIRoute):
            log.info(f"ROUTE: {','.join(sorted(r.methods))} {r.path}")

@app.get("/__routes")
async def __routes():
    return [{"methods": sorted(list(r.methods)), "path": r.path}
            for r in app.routes if isinstance(r, APIRoute)]
