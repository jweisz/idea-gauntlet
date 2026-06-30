from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..models import schema
from ..models.db import get_db
from ..core.llm import invalidate_settings_cache
from ..core.deps import get_app_config

router = APIRouter(prefix="/api/settings", tags=["Settings"])

_API_KEY_FIELDS = {"openai_api_key", "anthropic_api_key", "google_api_key"}
_MODEL_FIELDS = {"non_agent_provider", "non_agent_model"}


# Global settings for the single authorized user
@router.get("/", response_model=dict)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(schema.GlobalSettings).first()
    if not settings:
        return {}
    return {
        "openai_api_key": settings.openai_api_key is not None,
        "anthropic_api_key": settings.anthropic_api_key is not None,
        "google_api_key": settings.google_api_key is not None,
        "ollama_base_url": settings.ollama_base_url,
        "theme_preferences": settings.theme_preferences,
        "default_agent_turn_budget": settings.default_agent_turn_budget,
        "global_system_instruction": settings.global_system_instruction,
        "non_agent_provider": settings.non_agent_provider,
        "non_agent_model": settings.non_agent_model,
    }


@router.post("/")
def update_settings(
    settings_in: dict,
    db: Session = Depends(get_db),
    cfg: dict = Depends(get_app_config),
):
    settings = db.query(schema.GlobalSettings).first()
    if not settings:
        # Assuming single user system for v1
        settings = schema.GlobalSettings()
        db.add(settings)

    # Defense-in-depth: in hosted mode the overlay disables these flags, so the
    # server silently ignores attempts to set API keys / model overrides even if
    # a request bypasses the (hidden) UI.
    if not cfg.get("show_api_key_settings", True):
        settings_in = {k: v for k, v in settings_in.items() if k not in _API_KEY_FIELDS}
    if not cfg.get("show_model_selection", True):
        settings_in = {k: v for k, v in settings_in.items() if k not in _MODEL_FIELDS}

    if "openai_api_key" in settings_in:
        settings.openai_api_key = settings_in["openai_api_key"]
    if "anthropic_api_key" in settings_in:
        settings.anthropic_api_key = settings_in["anthropic_api_key"]
    if "google_api_key" in settings_in:
        settings.google_api_key = settings_in["google_api_key"]
    if "ollama_base_url" in settings_in:
        settings.ollama_base_url = settings_in["ollama_base_url"]
    if "theme_preferences" in settings_in:
        settings.theme_preferences = settings_in["theme_preferences"]
    if "default_agent_turn_budget" in settings_in:
        settings.default_agent_turn_budget = settings_in["default_agent_turn_budget"]
    if "global_system_instruction" in settings_in:
        settings.global_system_instruction = settings_in["global_system_instruction"]
    if "non_agent_provider" in settings_in:
        settings.non_agent_provider = settings_in["non_agent_provider"]
    if "non_agent_model" in settings_in:
        settings.non_agent_model = settings_in["non_agent_model"]

    db.commit()
    invalidate_settings_cache()
    return {"status": "updated"}
