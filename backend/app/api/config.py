"""
Public runtime configuration for the frontend.

Returns feature flags so the SPA can conditionally render (hide API-key/model
settings in hosted mode, show the waitlist screen when not accepting new
players, etc.). The payload is produced by the ``get_app_config`` seam, which
the hosted overlay overrides; this router itself is unchanged across
deployments.
"""

from fastapi import APIRouter, Depends

from ..core.deps import get_app_config

router = APIRouter(prefix="/api", tags=["Meta"])


@router.get("/config")
def app_config(cfg: dict = Depends(get_app_config)) -> dict:
    return cfg
