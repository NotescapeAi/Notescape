# app/main.py
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.routing import APIRoute
import logging

from app.core.settings import settings
from app.routers.classes import router as classes_router
from app.routers.files import router as files_router
from app.routers.chunks import router as chunks_router
from app.routers.embeddings import router as embeddings_router
from app.routers.flashcards import router as flashcards_router
from app.routers.health import router as health_router

app = FastAPI(title=settings.api_title)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# uploads directory
backend_dir = Path(__file__).resolve().parents[1]
proj_root = backend_dir.parent
uploads_dir = Path(settings.upload_root).resolve() if settings.upload_root else (proj_root / "uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
app.state.uploads_root = uploads_dir

logging.getLogger("uvicorn.error").info(f"[main] uploads_root = {uploads_dir}")

# Routers
app.include_router(classes_router)
app.include_router(files_router)
app.include_router(chunks_router)
app.include_router(embeddings_router)
app.include_router(flashcards_router)
app.include_router(health_router)

@app.get("/__routes")
async def __routes():
    return [
        {"methods": sorted(list(r.methods)), "path": r.path}
        for r in app.routes
        if isinstance(r, APIRoute)
    ]
