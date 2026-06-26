"""Supabase JWT verification dependency.

For endpoints called by the mobile app / dashboard (not by external
API customers), the right auth is the user's Supabase session JWT —
not an api_key Bearer token. This module provides the FastAPI
dependency `verify_supabase_jwt` that:

  1. Reads the Authorization: Bearer <jwt> header
  2. Validates the JWT signature against the Supabase JWT secret
  3. Returns the decoded claims, including `sub` (the user_id)

Endpoints add:

    auth = Depends(verify_supabase_jwt)
    user_id = auth["sub"]

This replaces the body-trust pattern where endpoints accepted
`user_id` as a request field with no verification.

The JWT secret must be available as SUPABASE_JWT_SECRET env var
(distinct from the SUPABASE_KEY anon key — visible in
Supabase dashboard -> Settings -> API -> "JWT Secret").
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, Request

logger = logging.getLogger(__name__)


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip()


async def verify_supabase_jwt(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """FastAPI dependency: validate a Supabase JWT and return its claims.

    Raises 401 on missing / malformed / invalid / expired tokens.
    Raises 503 if the server is not configured with a JWT secret.
    """
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="missing or malformed bearer token")

    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        logger.error("SUPABASE_JWT_SECRET not configured; cannot verify JWTs")
        raise HTTPException(status_code=503, detail="auth backend not configured")

    try:
        import jwt  # PyJWT
    except ImportError:
        logger.error("PyJWT not installed; cannot verify Supabase JWTs")
        raise HTTPException(status_code=503, detail="auth library unavailable")

    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="invalid token audience")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"invalid token: {exc}")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="token missing user_id")

    # Convenience field — mirror the api_key auth shape so callers can
    # treat both deps interchangeably where it makes sense.
    return {
        "user_id": user_id,
        "email": claims.get("email"),
        "claims": claims,
        "auth_type": "supabase_jwt",
    }
