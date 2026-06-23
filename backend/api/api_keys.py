"""API key CRUD endpoints for the in-dashboard key manager.

These endpoints are called by the logged-in user from the dashboard. They
manage the user's OWN set of keys (list, create, revoke). Customer apps use
the keys themselves to authenticate against other endpoints via the
``verify_api_key`` dependency in ``services/api_key_auth.py``.

Auth here is intentionally simple: ``user_id`` is in the request body. A
production deployment should layer Supabase JWT middleware that derives
``user_id`` from the bearer token instead. Marked as TODO below.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.api_key_auth import generate_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/keys", tags=["api-keys"])

MAX_KEYS_PER_USER = 10


class CreateKeyRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=80)
    scopes: Optional[List[str]] = None


class CreateKeyResponse(BaseModel):
    id: str
    key: str  # The plaintext value; shown ONCE, never again.
    prefix: str
    name: str
    created_at: str


class KeyRow(BaseModel):
    id: str
    name: str
    prefix: str
    scopes: List[str]
    last_used_at: Optional[str]
    created_at: str


@router.post("", response_model=CreateKeyResponse)
async def create_key(payload: CreateKeyRequest) -> CreateKeyResponse:
    from services._supabase import get_supabase_client

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=503, detail="storage unavailable")

    _enforce_key_quota(supabase, payload.user_id)
    full_key, prefix, key_hash = generate_key()

    try:
        inserted = (
            supabase.table("api_keys")
            .insert({
                "user_id": payload.user_id,
                "name": payload.name,
                "key_prefix": prefix,
                "key_hash": key_hash,
                "scopes": payload.scopes or [],
            })
            .execute()
            .data
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("api_keys insert failed")
        raise HTTPException(status_code=500, detail=str(exc))
    if not inserted:
        raise HTTPException(status_code=500, detail="insert returned no rows")

    row = inserted[0]
    return CreateKeyResponse(
        id=row["id"],
        key=full_key,
        prefix=prefix,
        name=row["name"],
        created_at=row["created_at"],
    )


@router.get("", response_model=List[KeyRow])
async def list_keys(user_id: str) -> List[KeyRow]:
    from services._supabase import get_supabase_client

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=503, detail="storage unavailable")
    try:
        rows = (
            supabase.table("api_keys")
            .select("id, name, key_prefix, scopes, last_used_at, created_at")
            .eq("user_id", user_id)
            .is_("revoked_at", "null")
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("api_keys list failed")
        raise HTTPException(status_code=500, detail=str(exc))
    return [
        KeyRow(
            id=r["id"],
            name=r["name"],
            prefix=r["key_prefix"],
            scopes=r.get("scopes") or [],
            last_used_at=r.get("last_used_at"),
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.delete("/{key_id}")
async def revoke_key(key_id: str, user_id: str) -> Dict[str, Any]:
    from services._supabase import get_supabase_client

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=503, detail="storage unavailable")
    try:
        updated = (
            supabase.table("api_keys")
            .update({"revoked_at": "now()"})
            .eq("id", key_id)
            .eq("user_id", user_id)
            .is_("revoked_at", "null")
            .execute()
            .data
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("api_keys revoke failed")
        raise HTTPException(status_code=500, detail=str(exc))
    if not updated:
        raise HTTPException(status_code=404, detail="key not found or already revoked")
    return {"status": "revoked", "id": key_id}


def _enforce_key_quota(supabase: Any, user_id: str) -> None:
    try:
        result = (
            supabase.table("api_keys")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .is_("revoked_at", "null")
            .execute()
        )
        active = getattr(result, "count", None) or 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("quota check failed: %s", exc)
        return  # fail-open — quota is a soft guard, not a security boundary
    if active >= MAX_KEYS_PER_USER:
        raise HTTPException(
            status_code=429,
            detail=f"key quota reached ({MAX_KEYS_PER_USER}); revoke one first",
        )
