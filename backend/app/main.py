from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.settings import settings
from app.routers.classes import router as classes_router
from app.routers.files import router as files_router
from app.routers.contact import router as contact_router
from app.routers.chunks import router as chunks_router
from app.routers import classes
from contextlib import asynccontextmanager
from app.core.db import close_pool


app = FastAPI(title=settings.api_title)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# repo root = .../backend/app/main.py -> parents[2]
repo_root = Path(__file__).resolve().parents[2]
uploads_dir = Path(settings.upload_root or (repo_root / "uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(classes_router)
app.include_router(files_router)
app.include_router(contact_router)
app.include_router(chunks_router)
app.include_router(classes.router)




@asynccontextmanager
async def lifespan(app: FastAPI):
    # Don't open the pool here; open lazily on first use.
    yield
    # Ensure clean shutdown when tests/actions finish
    await close_pool()

app = FastAPI(lifespan=lifespan)

