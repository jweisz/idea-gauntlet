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
from ..services.gauntlet import DIFFICULTY_BOSSES, DIFFICULTY_PROGRESSION

router = APIRouter(prefix="/api", tags=["Meta"])


@router.get("/config")
def app_config(cfg: dict = Depends(get_app_config)) -> dict:
    # The gauntlet shape is merged in here rather than inside the get_app_config
    # seam: it is identical across deployments, and the hosted overlay replaces
    # that seam wholesale, so anything added there would have to be kept in sync
    # (and would silently be missing in hosted until it was).
    return {
        **cfg,
        "difficulty_bosses": DIFFICULTY_BOSSES,
        "difficulty_progression": DIFFICULTY_PROGRESSION,
    }
