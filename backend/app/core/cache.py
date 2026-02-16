import json
import logging
from typing import Any, Optional

from redis import Redis
from redis.exceptions import RedisError

from app.core.settings import settings

log = logging.getLogger("uvicorn.error")
_redis: Optional[Redis] = None


def get_redis() -> Optional[Redis]:
    global _redis
    if _redis is not None:
        return _redis
    if not getattr(settings, "redis_url", None):
        return None
    try:
        _redis = Redis.from_url(settings.redis_url, decode_responses=False)
        return _redis
    except Exception as exc:
        log.warning(f"[cache] Redis init failed: {exc}")
        return None


def cache_get(key: str) -> Optional[bytes]:
    client = get_redis()
    if not client:
        return None
    try:
        return client.get(key)
    except RedisError as exc:
        log.warning(f"[cache] GET failed for {key}: {exc}")
        return None


def cache_set(key: str, value: bytes, ttl_seconds: int) -> bool:
    client = get_redis()
    if not client:
        return False
    try:
        client.set(key, value, ex=ttl_seconds)
        return True
    except RedisError as exc:
        log.warning(f"[cache] SET failed for {key}: {exc}")
        return False


def cache_get_json(key: str) -> Optional[Any]:
    raw = cache_get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        log.warning(f"[cache] JSON decode failed for {key}: {exc}")
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int) -> bool:
    try:
        raw = json.dumps(value).encode("utf-8")
    except Exception as exc:
        log.warning(f"[cache] JSON encode failed for {key}: {exc}")
        return False
    return cache_set(key, raw, ttl_seconds)
