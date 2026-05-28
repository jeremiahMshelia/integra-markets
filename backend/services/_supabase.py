"""Shared Supabase client lookup for routers.

Routers can't import the client from ``main`` at module-import time because of
circular imports — ``main`` imports the routers. This helper does the lookup
lazily at call time and tries both possible entry-point modules.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def get_supabase_client() -> Optional[Any]:
    """Return the Supabase client from whichever entry-point module loaded it.

    Returns None if neither module is importable or if no client is configured.
    """
    for module_name in ("main_integrated", "main"):
        try:
            module = __import__(module_name)
            client = getattr(module, "supabase", None)
            if client is not None:
                return client
        except ImportError:
            continue
    return None
