import logging
import os
from pathlib import Path
from typing import Optional

from app.core.db import db_conn

log = logging.getLogger("uvicorn.error")
_DEFAULT_SQL_PATH = Path(__file__).resolve().parents[2] / "db" / "init" / "10_quizzes.sql"


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
