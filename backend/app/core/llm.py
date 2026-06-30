import os
import time
from langchain_litellm import ChatLiteLLM
from sqlalchemy.orm import Session
from ..models.db import SessionLocal
from ..models.schema import Agent, GlobalSettings

# When running inside Docker, Ollama lives on the host — not localhost.
# Docker Desktop resolves host.docker.internal → host IP automatically on Mac/Windows.
# Override with OLLAMA_BASE_URL env var for custom setups (e.g. Ollama on a remote machine).
DEFAULT_OLLAMA_URL = os.environ.get(
    "OLLAMA_BASE_URL", "http://host.docker.internal:11434"
)
SETTINGS_CACHE_TTL_SECONDS = 2.0

_settings_cache: tuple[float, dict] | None = None
_non_agent_model_cache: tuple[float, tuple[str, str]] | None = None


def _cache_valid(cached: tuple[float, object] | None) -> bool:
    if cached is None:
        return False
    return (time.monotonic() - cached[0]) < SETTINGS_CACHE_TTL_SECONDS


def invalidate_settings_cache() -> None:
    global _settings_cache
    global _non_agent_model_cache
    _settings_cache = None
    _non_agent_model_cache = None


def get_settings_from_db():
    global _settings_cache
    if _cache_valid(_settings_cache):
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
            "NON_AGENT_PROVIDER": settings.non_agent_provider
            or os.environ.get("NON_AGENT_PROVIDER"),
            "NON_AGENT_MODEL": settings.non_agent_model
            or os.environ.get("NON_AGENT_MODEL"),
        }
    else:
        payload = {"OLLAMA_BASE_URL": DEFAULT_OLLAMA_URL}

    _settings_cache = (time.monotonic(), payload)
    return payload


def get_non_agent_model_config() -> tuple[str, str]:
    """
    Returns the provider/model used for non-agent inference
    (router, context summarization, semantic analysis).
    Resolution order:
    1) Global settings non_agent_provider/non_agent_model
    2) NON_AGENT_PROVIDER/NON_AGENT_MODEL environment variables
    3) First configured arena agent model
    4) Local-safe default (ollama/llama3.2:3b)
    """
    global _non_agent_model_cache
    if _cache_valid(_non_agent_model_cache):
        return _non_agent_model_cache[1]

    db: Session = SessionLocal()
    try:
        settings = db.query(GlobalSettings).first()
        if settings and settings.non_agent_provider and settings.non_agent_model:
            config = (settings.non_agent_provider, settings.non_agent_model)
            _non_agent_model_cache = (time.monotonic(), config)
            return config

        env_provider = os.environ.get("NON_AGENT_PROVIDER")
        env_model = os.environ.get("NON_AGENT_MODEL")
        if env_provider and env_model:
            config = (env_provider, env_model)
            _non_agent_model_cache = (time.monotonic(), config)
            return config

        first_agent = (
            db.query(Agent).order_by(Agent.sort_order.asc(), Agent.id.asc()).first()
        )
        if first_agent and first_agent.provider and first_agent.model:
            config = (first_agent.provider, first_agent.model)
            _non_agent_model_cache = (time.monotonic(), config)
            return config
    finally:
        db.close()

    config = ("ollama", "llama3.2:3b")
    _non_agent_model_cache = (time.monotonic(), config)
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

    kwargs = {"model": full_model_string, "temperature": temperature, "streaming": True}

    # Ollama: use dynamic URL from DB if available, else default
    if provider == "ollama":
        kwargs["api_base"] = settings.get("OLLAMA_BASE_URL") or DEFAULT_OLLAMA_URL

    return ChatLiteLLM(**kwargs)
