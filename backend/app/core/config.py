"""
Centralized backend configuration.

Three tiers, by what each value is:
  - Secrets / per-deployment infra  -> environment variables (here).
  - Static, non-secret tuning        -> app/config.toml (loaded here).
  - Runtime, user-editable settings  -> the database (GlobalSettings).

The private hosted overlay layers behavior on top via dependency overrides; it
does not modify this file.
"""

import os
import tomllib
from functools import lru_cache
from importlib import resources
from typing import Any


# Deployment mode. The public core only ever runs as "self_host". The private
# overlay sets DEPLOYMENT_MODE=hosted and overrides the relevant dependencies.
DEPLOYMENT_MODE = os.environ.get("DEPLOYMENT_MODE", "self_host").strip().lower()

# Default CORS origins for local Vite dev servers (Arena :5173, Gauntlet :5174).
_DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]


def is_hosted() -> bool:
    return DEPLOYMENT_MODE == "hosted"


def lock_llm_settings() -> bool:
    """Whether the LLM provider/model/API-key fields should be hidden from Settings.

    Set LOCK_LLM_SETTINGS=true for a self-host deploy (e.g. Render) where the
    operator configures the LLM entirely via env vars — API key(s) plus
    NON_AGENT_PROVIDER/NON_AGENT_MODEL — and doesn't want it visible or
    editable by whoever opens the app. Defaults to false so a local/self-host
    run with no env vars set still gets the in-app onboarding UI.
    """
    return os.environ.get("LOCK_LLM_SETTINGS", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


_DEFAULT_GAME_NAME = "Idea Gauntlet"

# Fallbacks if config.toml is missing/unreadable, so the app still boots.
_DEFAULT_GAMEPLAY: dict[str, Any] = {
    "max_hp": 100,
    "min_damage": 12,
    "max_damage": 40,
    "max_idea_chars": 600,
    "max_attack_chars": 2000,
    "reply_word_limit": 90,
    "difficulty": {
        "easy": {"user": 1.5, "boss": 0.75},
        "normal": {"user": 1.2, "boss": 0.9},
        "difficult": {"user": 1.0, "boss": 1.0},
    },
}


@lru_cache(maxsize=1)
def _config() -> dict:
    """Load and cache app/config.toml.

    Read via importlib.resources so it resolves whether the core runs in-tree or
    pip-installed (e.g. by the overlay). Edits require a restart.
    """
    try:
        raw = resources.files("app").joinpath("config.toml").read_text(encoding="utf-8")
        return tomllib.loads(raw)
    except Exception:
        return {}


def game_name() -> str:
    """Display name of the game (config.toml [branding].name)."""
    name = _config().get("branding", {}).get("name")
    return (name or _DEFAULT_GAME_NAME).strip() or _DEFAULT_GAME_NAME


def gameplay() -> dict:
    """Gameplay tuning (config.toml [gameplay]), merged over safe defaults."""
    cfg = _config().get("gameplay", {})
    merged = {**_DEFAULT_GAMEPLAY, **cfg}
    # Ensure all difficulty tiers exist even if the file overrides only some.
    merged["difficulty"] = {
        **_DEFAULT_GAMEPLAY["difficulty"],
        **cfg.get("difficulty", {}),
    }
    return merged


@lru_cache(maxsize=1)
def allowed_origins() -> list[str]:
    """CORS origins.

    Set ALLOWED_ORIGINS to a comma-separated list in production
    (e.g. "https://idea-gauntlet.com,https://www.idea-gauntlet.com").
    Falls back to the local dev origins when unset.
    """
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return list(_DEFAULT_DEV_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]
