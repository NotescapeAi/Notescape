import logging
import os
from pathlib import Path
from typing import Optional

from app.core.db import db_conn

log = logging.getLogger("uvicorn.error")
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_SQL_PATH = _REPO_ROOT / "db" / "init" / "10_quizzes.sql"
_DEFAULT_LEARNING_ANALYTICS_SQL_PATH = (
    _REPO_ROOT / "db" / "init" / "11_learning_analytics_tags.sql"
)


def _sql_candidates() -> tuple[list[Path], Optional[Path]]:
    env_path = os.environ.get("QUIZ_MIGRATION_FILE")
    candidates: list[Path] = []
    if env_path:
        candidates.append(Path(env_path))
    candidates.append(_DEFAULT_SQL_PATH)

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
    sql_path = Path(
        os.environ.get(
            "LEARNING_ANALYTICS_MIGRATION_FILE",
            str(_DEFAULT_LEARNING_ANALYTICS_SQL_PATH),
        )
    )
    if not sql_path.exists():
        log.warning("Learning analytics migration file not found at %s", sql_path)
        return

    sql = sql_path.read_text()
    if not sql.strip():
        return

    async with db_conn() as (conn, cur):
        log.info("Ensuring learning analytics schema exists using %s", sql_path.name)
        await cur.execute(sql)
        await conn.commit()
