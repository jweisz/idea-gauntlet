import httpx
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..models import schema
from ..models.db import get_db
from ..core.llm import DEFAULT_OLLAMA_URL

router = APIRouter(prefix="/api/providers", tags=["Providers"])
logger = logging.getLogger(__name__)


def _extract_error_detail(res: httpx.Response) -> str:
    """Best-effort human-readable message from a provider's error response body."""
    try:
        data = res.json()
        err = data.get("error")
        msg = err.get("message") if isinstance(err, dict) else err
        if msg:
            return str(msg)
    except Exception:
        pass
    text = (res.text or "").strip()
    return text[:200] if text else f"HTTP {res.status_code}"


async def fetch_ollama_models(base_url: str) -> list[str] | None:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.get(f"{base_url}/api/tags")
            if res.status_code == 200:
                data = res.json()
                # Sort alphabetically
                return sorted([m["name"] for m in data.get("models", [])])
    except Exception as e:
        logger.warning(f"Failed to fetch Ollama models from {base_url}: {e}")
    return None


async def fetch_openai_models(api_key: str) -> tuple[list[str], str | None]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            headers = {"Authorization": f"Bearer {api_key}"}
            res = await client.get("https://api.openai.com/v1/models", headers=headers)
            if res.status_code == 200:
                data = res.json()
                # Filter to only chat models like gpt-*, o1-*, o3-*
                models = [
                    m["id"]
                    for m in data.get("data", [])
                    if m["id"].startswith(("gpt-", "o1-", "o3-"))
                ]
                return sorted(models, reverse=True), None  # newer models sort higher
            return [], f"OpenAI API error: {_extract_error_detail(res)}"
    except Exception as e:
        logger.warning(f"Failed to fetch OpenAI models: {e}")
        return [], f"Could not reach OpenAI API: {e}"


async def fetch_anthropic_models(api_key: str) -> tuple[list[str], str | None]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
            res = await client.get(
                "https://api.anthropic.com/v1/models", headers=headers
            )
            if res.status_code == 200:
                data = res.json()
                models = [m["id"] for m in data.get("data", [])]
                return sorted(models), None
            return [], f"Anthropic API error: {_extract_error_detail(res)}"
    except Exception as e:
        logger.warning(f"Failed to fetch Anthropic models: {e}")
        return [], f"Could not reach Anthropic API: {e}"


async def fetch_gemini_models(api_key: str) -> tuple[list[str], str | None]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            )
            if res.status_code == 200:
                data = res.json()
                # Strip the "models/" prefix Google uses, and filter generic models
                models = [
                    m["name"].replace("models/", "")
                    for m in data.get("models", [])
                    if "gemini" in m["name"]
                ]
                return sorted(models, reverse=True), None
            return [], f"Gemini API error: {_extract_error_detail(res)}"
    except Exception as e:
        logger.warning(f"Failed to fetch Gemini models: {e}")
        return [], f"Could not reach Gemini API: {e}"


@router.get("/models")
async def get_available_models(db: Session = Depends(get_db)):
    """
    Returns a unified list of providers and their available models based on
    the API keys currently configured in the database, plus Ollama (which
    runs locally/host without a key).

    Cloud provider model lists are always fetched live from that provider's
    API — never hardcoded — so a fetch failure (bad key, network issue, rate
    limit) surfaces as an `error` string on that provider's entry rather than
    silently falling back to a list that can drift out of date.
    """
    settings = db.query(schema.GlobalSettings).first()

    # 1. Check Ollama depending on config
    ollama_url = (
        settings.ollama_base_url
        if settings and settings.ollama_base_url
        else DEFAULT_OLLAMA_URL
    )
    ollama_models = await fetch_ollama_models(ollama_url)

    providers = []

    if ollama_models is not None:
        providers.append({"provider": "ollama", "models": ollama_models, "error": None})
    else:
        # If None, it means connection failed. We don't add it to providers.
        pass

    # 2. Check Cloud Providers if keys exist
    if settings:
        if settings.openai_api_key:
            models, error = await fetch_openai_models(settings.openai_api_key)
            providers.append({"provider": "openai", "models": models, "error": error})

        if settings.anthropic_api_key:
            models, error = await fetch_anthropic_models(settings.anthropic_api_key)
            providers.append(
                {"provider": "anthropic", "models": models, "error": error}
            )

        if settings.google_api_key:
            models, error = await fetch_gemini_models(settings.google_api_key)
            providers.append({"provider": "gemini", "models": models, "error": error})

    return providers
