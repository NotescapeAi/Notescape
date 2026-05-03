"""Resolve local on-disk paths for class documents.

Uploads are stored under ``{upload_root}/class_{class_id}/{document_id}/{stored_file}``.
The database ``storage_key`` should hold the POSIX path relative to ``upload_root``.
If that path is wrong or missing (renames, legacy rows, sanitization drift), we
discover the original file inside the document folder and optionally repair ``storage_key``.
"""

from __future__ import annotations

import logging
from pathlib import Path, PurePosixPath
from uuid import UUID

log = logging.getLogger("uvicorn.error")

_SKIP_DISCOVERY_NAMES = frozenset({".ds_store", "thumbs.db", "desktop.ini"})


def _under_upload_root(path: Path, upload_root: Path) -> bool:
    try:
        path.resolve().relative_to(upload_root.resolve())
        return True
    except ValueError:
        return False


def relative_from_storage_fields(storage_key: str | None, storage_url: str | None) -> PurePosixPath | None:
    if storage_key and not str(storage_key).startswith("notescape/"):
        return PurePosixPath(str(storage_key))
    if storage_url:
        su = str(storage_url)
        if su.startswith("/uploads/"):
            return PurePosixPath(su).relative_to("/uploads")
        if su.startswith("uploads/"):
            return PurePosixPath(su).relative_to("uploads")
    return None


def _valid_document_uuid(document_id: str) -> bool:
    try:
        UUID(str(document_id))
        return True
    except Exception:
        return False


def discover_file_in_document_folder(
    upload_root: Path,
    class_id: int,
    document_id: str,
    *,
    hint_display_filename: str | None = None,
) -> Path | None:
    if not _valid_document_uuid(document_id):
        return None
    folder = (upload_root / f"class_{class_id}" / str(document_id)).resolve()
    if not folder.is_dir() or not _under_upload_root(folder, upload_root):
        return None
    sensible: list[Path] = []
    for p in folder.iterdir():
        if not p.is_file():
            continue
        name = p.name.lower()
        if name.startswith(".") or name in _SKIP_DISCOVERY_NAMES:
            continue
        sensible.append(p)
    if not sensible:
        return None
    if len(sensible) == 1:
        return sensible[0]
    if hint_display_filename:
        hint_lower = hint_display_filename.lower()
        stem = Path(hint_display_filename).stem.lower()
        for p in sensible:
            if p.name.lower() == hint_lower:
                return p
        for p in sensible:
            if Path(p.name).stem.lower() == stem:
                return p
    return max(sensible, key=lambda p: p.stat().st_size)


def resolve_local_original_file(
    upload_root: Path,
    class_id: int,
    document_id: str,
    storage_key: str | None,
    storage_url: str | None,
    *,
    hint_display_filename: str | None = None,
    context: str = "resolve",
) -> tuple[Path | None, PurePosixPath | None]:
    """Return ``(absolute_path, relative_under_upload_root)`` if a file is found."""
    upload_root = upload_root.resolve()
    rel = relative_from_storage_fields(storage_key, storage_url)
    if rel is not None:
        candidate = (upload_root / Path(rel.as_posix())).resolve()
        if candidate.is_file() and _under_upload_root(candidate, upload_root):
            try:
                computed = PurePosixPath(candidate.relative_to(upload_root).as_posix())
            except ValueError:
                computed = PurePosixPath(rel.as_posix())
            return candidate, computed
        log.warning(
            "[storage] %s path from DB not usable class_id=%s document_id=%s rel=%s exists=%s is_file=%s",
            context,
            class_id,
            document_id,
            rel,
            candidate.exists(),
            candidate.is_file() if candidate.exists() else False,
        )
    discovered = discover_file_in_document_folder(
        upload_root,
        class_id,
        document_id,
        hint_display_filename=hint_display_filename,
    )
    if discovered is not None and _under_upload_root(discovered, upload_root):
        rel2 = PurePosixPath(discovered.relative_to(upload_root).as_posix())
        log.info(
            "[storage] %s discovered file class_id=%s document_id=%s rel=%s",
            context,
            class_id,
            document_id,
            rel2,
        )
        return discovered, rel2
    log.warning(
        "[storage] %s no file on disk class_id=%s document_id=%s had_storage_key=%s",
        context,
        class_id,
        document_id,
        bool(storage_key),
    )
    return None, None


def stored_disk_basename(file_id: str, safe_sanitized_filename: str, original_filename: str) -> str:
    """Unique on-disk name: ``{uuid}.{ext}`` (ext from sanitized name, else original)."""
    ext = Path(safe_sanitized_filename).suffix.lower()
    if not ext:
        ext = Path(original_filename or "").suffix.lower()
    if not ext:
        ext = ".bin"
    return f"{file_id}{ext}"
