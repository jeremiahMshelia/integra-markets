"""API key generation, hashing, and verification.

Format: ``ik_live_<22 cryptographically random urlsafe chars>``. The full key
value leaves the server exactly once (on create). Only the prefix (first 11
chars, unique-indexed) and ``sha256(key)`` are stored.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, Request

logger = logging.getLogger(__name__)

KEY_PREFIX_VISIBLE_LENGTH = 11  # "ik_live_xxx"
PUBLIC_PREFIX = "ik_live_"
KEY_BODY_BYTES = 24  # 24 random bytes → ~32 urlsafe chars


def generate_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, sha256_hex)."""
    full_key = PUBLIC_PREFIX + secrets.token_urlsafe(KEY_BODY_BYTES)
    prefix = full_key[:KEY_PREFIX_VISIBLE_LENGTH]
    key_hash = hashlib.sha256(full_key.encode("utf-8")).hexdigest()
    return full_key, prefix, key_hash


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip()


async def verify_api_key(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """FastAPI dependency: validate Authorization header against api_keys table.

    Returns the api_keys row on success. Raises 401 on failure.
    """
    from services._supabase import get_supabase_client

    key = _extract_bearer(authorization)
    if not key or not key.startswith(PUBLIC_PREFIX):
        raise HTTPException(status_code=401, detail="missing or malformed API key")

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=503, detail="auth backend unavailable")

    started = time.monotonic()
    row = _lookup_row(supabase, key)
    if row is None:
        raise HTTPException(status_code=401, detail="invalid API key")

    _record_usage_async(supabase, row, request, int((time.monotonic() - started) * 1000))
    return row


def _lookup_row(supabase: Any, key: str) -> Optional[Dict[str, Any]]:
    prefix = key[:KEY_PREFIX_VISIBLE_LENGTH]
    try:
        rows = (
            supabase.table("api_keys")
            .select("*")
            .eq("key_prefix", prefix)
            .is_("revoked_at", "null")
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("api_keys lookup failed: %s", exc)
        return None
    if not rows:
        return None
    if not hmac.compare_digest(hash_key(key), rows[0]["key_hash"]):
        return None
    return rows[0]


def _record_usage_async(supabase: Any, row: Dict[str, Any], request: Request, latency_ms: int) -> None:
    """Best-effort write; never raise from inside an authenticated request."""
    try:
        supabase.table("api_key_usage").insert({
            "key_id": row["id"],
            "endpoint": request.url.path,
            "method": request.method,
            "latency_ms": latency_ms,
        }).execute()
        supabase.table("api_keys").update({
            "last_used_at": "now()",
        }).eq("id", row["id"]).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("api_key usage logging failed: %s", exc)
