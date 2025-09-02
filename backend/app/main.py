from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.settings import settings
from app.routers.classes import router as classes_router
from app.routers.files import router as files_router
from app.routers.contact import router as contact_router
from app.routers.chunks import router as chunks_router
from fastapi.routing import APIRoute
import logging


app = FastAPI(title=settings.api_title)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Pick the project root that contains both backend/ and frontend/ ---
# __file__ = .../backend/app/main.py
backend_dir = Path(__file__).resolve().parents[1]   # .../backend
proj_root   = backend_dir.parent                    # .../Notescape

# Prefer env/settings if provided; otherwise use the sibling uploads/
uploads_dir = Path(settings.upload_root).resolve() if settings.upload_root else (proj_root / "uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
app.state.uploads_root = uploads_dir  # <-- share with routers

logging.getLogger("uvicorn.error").info(f"[main] uploads_root = {uploads_dir}")


@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(classes_router)
app.include_router(files_router)
app.include_router(contact_router)
app.include_router(chunks_router)


@app.on_event("startup")
async def show_routes():
    log = logging.getLogger("uvicorn.error")
    for r in app.routes:
        if isinstance(r, APIRoute):
            log.info(f"ROUTE: {','.join(sorted(r.methods))} {r.path}")

@app.get("/__routes")
async def __routes():
    return [
        {"methods": sorted(list(r.methods)), "path": r.path}
        for r in app.routes
        if isinstance(r, APIRoute)
    ]
