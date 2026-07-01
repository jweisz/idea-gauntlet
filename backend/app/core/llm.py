import os
import time
import httpx
from typing import Any
from langchain_litellm import ChatLiteLLM
from sqlalchemy.orm import Session
from ..models.db import SessionLocal
from ..models.schema import GlobalSettings

# Override with OLLAMA_BASE_URL env var for custom setups (e.g. Ollama on a remote machine).
DEFAULT_OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
SETTINGS_CACHE_TTL_SECONDS = 2.0


def _ollama_reachable(base_url: str, timeout: float = 1.5) -> bool:
    try:
        return httpx.get(f"{base_url}/api/tags", timeout=timeout).status_code == 200
    except Exception:
        return False


def detect_local_ollama_url() -> str | None:
    """Check whether Ollama is reachable at the default local address.

    Used once at startup on a brand-new database to auto-wire an
    already-running local Ollama in, so self-host users who have it
    installed get a working provider without having to type the URL into
    Settings by hand.
    """
    return DEFAULT_OLLAMA_URL if _ollama_reachable(DEFAULT_OLLAMA_URL) else None


_settings_cache: tuple[float, dict] | None = None
_llm_config_cache: tuple[float, tuple[str, str]] | None = None


def _cache_valid(cached: tuple[float, object] | None) -> bool:
    if cached is None:
        return False
    return (time.monotonic() - cached[0]) < SETTINGS_CACHE_TTL_SECONDS


def invalidate_settings_cache() -> None:
    global _settings_cache
    global _llm_config_cache
    _settings_cache = None
    _llm_config_cache = None


def get_settings_from_db():
    global _settings_cache
    if _settings_cache is not None and _cache_valid(_settings_cache):
        return _settings_cache[1]

    db: Session = SessionLocal()
    settings = db.query(GlobalSettings).first()
    db.close()
    if settings:
        payload = {
            "OPENAI_API_KEY": settings.openai_api_key
            or os.environ.get("OPENAI_API_KEY"),
            "ANTHROPIC_API_KEY": settings.anthropic_api_key
            or os.environ.get("ANTHROPIC_API_KEY"),
            "GEMINI_API_KEY": settings.google_api_key
            or os.environ.get("GEMINI_API_KEY"),
            "OLLAMA_BASE_URL": settings.ollama_base_url or DEFAULT_OLLAMA_URL,
            "LLM_PROVIDER": settings.llm_provider or os.environ.get("LLM_PROVIDER"),
            "LLM_MODEL": settings.llm_model or os.environ.get("LLM_MODEL"),
        }
    else:
        payload = {"OLLAMA_BASE_URL": DEFAULT_OLLAMA_URL}

    _settings_cache = (time.monotonic(), payload)
    return payload


def get_llm_config() -> tuple[str, str]:
    """
    Returns the single global provider/model used for all LLM inference
    (agent battle replies, gatekeeper, scoring, summaries).
    Resolution order:
    1) Global settings llm_provider/llm_model
    2) LLM_PROVIDER/LLM_MODEL environment variables
    3) Local-safe default (ollama/llama3.2:3b)
    """
    global _llm_config_cache
    if _llm_config_cache is not None and _cache_valid(_llm_config_cache):
        return _llm_config_cache[1]

    db: Session = SessionLocal()
    try:
        settings = db.query(GlobalSettings).first()
        if settings and settings.llm_provider and settings.llm_model:
            config = (settings.llm_provider, settings.llm_model)
            _llm_config_cache = (time.monotonic(), config)
            return config

        env_provider = os.environ.get("LLM_PROVIDER")
        env_model = os.environ.get("LLM_MODEL")
        if env_provider and env_model:
            config = (env_provider, env_model)
            _llm_config_cache = (time.monotonic(), config)
            return config
    finally:
        db.close()

    config = ("ollama", "llama3.2:3b")
    _llm_config_cache = (time.monotonic(), config)
    return config


def get_llm(provider: str, model_name: str, temperature: float = 0.7):
    """
    Returns a unified LangChain ChatLiteLLM instance.
    Provider mapping examples:
    - openai   → model="gpt-4o"
    - anthropic → model="claude-3-5-sonnet-20241022"
    - gemini   → model="gemini/gemini-2.0-flash"
    - ollama   → model="llama3.2:1b"  (routed to OLLAMA_BASE_URL)
    """
    settings = get_settings_from_db()

    # Set standard API keys in environment for LiteLLM
    for key in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]:
        if settings.get(key):
            os.environ[key] = settings[key]

    # Build the LiteLLM model string
    no_prefix_providers = {"openai"}
    already_prefixed = f"{provider}/" in model_name
    full_model_string = (
        model_name
        if provider in no_prefix_providers or already_prefixed
        else f"{provider}/{model_name}"
    )

    kwargs: dict[str, Any] = {
        "model": full_model_string,
        "temperature": temperature,
        "streaming": True,
    }

    # Ollama: use dynamic URL from DB if available, else default
    if provider == "ollama":
        kwargs["api_base"] = settings.get("OLLAMA_BASE_URL") or DEFAULT_OLLAMA_URL

    return ChatLiteLLM(**kwargs)
