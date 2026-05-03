import logging
import os
from pathlib import Path
from typing import Optional

from app.core.db import db_conn

log = logging.getLogger("uvicorn.error")
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DOCKER_DB_INIT = Path("/workspace/db/init")
_DEFAULT_SQL_PATH = _REPO_ROOT / "db" / "init" / "10_quizzes.sql"
_DEFAULT_LEARNING_ANALYTICS_SQL_PATH = _REPO_ROOT / "db" / "init" / "11_learning_analytics_tags.sql"
_DEFAULT_OCR_PIPELINE_SQL_PATH = _REPO_ROOT / "db" / "init" / "20_ocr_pipeline.sql"
_DEFAULT_STUDY_PLAN_VOICE_SQL_PATH = _REPO_ROOT / "db" / "init" / "21_study_plan_voice.sql"
_DEFAULT_DOCUMENT_STORAGE_SQL_PATH = _REPO_ROOT / "db" / "init" / "22_document_storage_filenames.sql"
_DEFAULT_DOCUMENT_PREVIEW_PIPELINE_SQL_PATH = _REPO_ROOT / "db" / "init" / "23_document_preview_pipeline.sql"


def _migration_candidates(env_var: str, filename: str, default_path: Path) -> list[Path]:
    candidates: list[Path] = []
    env_path = os.environ.get(env_var)
    if env_path:
        candidates.append(Path(env_path))
    candidates.append(_DOCKER_DB_INIT / filename)
    candidates.append(default_path)
    return candidates


def _sql_candidates() -> tuple[list[Path], Optional[Path]]:
    candidates = _migration_candidates("QUIZ_MIGRATION_FILE", "10_quizzes.sql", _DEFAULT_SQL_PATH)

    for candidate in candidates:
        if candidate.exists():
            return candidates, candidate

    return candidates, None


async def ensure_quiz_jobs_schema() -> None:
    candidates, sql_path = _sql_candidates()
    if not sql_path:
        log.warning(
            "Quiz migration file not found, tried %s",
            ", ".join(str(p) for p in candidates),
        )
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring quiz_jobs schema exists using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()


async def ensure_learning_analytics_schema() -> None:
    candidates = _migration_candidates(
        "LEARNING_ANALYTICS_MIGRATION_FILE",
        "11_learning_analytics_tags.sql",
        _DEFAULT_LEARNING_ANALYTICS_SQL_PATH,
    )
    sql_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if not sql_path:
        log.warning(
            "Learning analytics migration file not found, tried %s",
            ", ".join(str(p) for p in candidates),
        )
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring learning analytics schema exists using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()


async def ensure_ocr_pipeline_schema() -> None:
    candidates = _migration_candidates(
        "OCR_PIPELINE_MIGRATION_FILE",
        "20_ocr_pipeline.sql",
        _DEFAULT_OCR_PIPELINE_SQL_PATH,
    )
    sql_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if not sql_path:
        log.warning(
            "OCR pipeline migration file not found, tried %s",
            ", ".join(str(p) for p in candidates),
        )
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring OCR pipeline schema exists using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()


async def ensure_document_preview_pipeline_schema() -> None:
    candidates = _migration_candidates(
        "DOCUMENT_PREVIEW_PIPELINE_MIGRATION_FILE",
        "23_document_preview_pipeline.sql",
        _DEFAULT_DOCUMENT_PREVIEW_PIPELINE_SQL_PATH,
    )
    sql_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if not sql_path:
        log.warning(
            "Document preview pipeline migration file not found, tried %s",
            ", ".join(str(p) for p in candidates),
        )
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring document preview pipeline columns exist using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()


async def ensure_document_storage_schema() -> None:
    candidates = _migration_candidates(
        "DOCUMENT_STORAGE_MIGRATION_FILE",
        "22_document_storage_filenames.sql",
        _DEFAULT_DOCUMENT_STORAGE_SQL_PATH,
    )
    sql_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if not sql_path:
        log.warning(
            "Document storage migration file not found, tried %s",
            ", ".join(str(p) for p in candidates),
        )
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring document storage columns exist using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()


async def ensure_study_plan_voice_schema() -> None:
    candidates = _migration_candidates(
        "STUDY_PLAN_VOICE_MIGRATION_FILE",
        "21_study_plan_voice.sql",
        _DEFAULT_STUDY_PLAN_VOICE_SQL_PATH,
    )
    sql_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if not sql_path:
        log.warning(
            "Study plan + voice revision migration file not found, tried %s",
            ", ".join(str(p) for p in candidates),
        )
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring study plan + voice revision schema exists using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()
