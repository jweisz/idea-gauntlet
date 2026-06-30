import os
import httpx
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..models import schema
from ..models.db import get_db

router = APIRouter(prefix="/api/providers", tags=["Providers"])
logger = logging.getLogger(__name__)


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


async def fetch_openai_models(api_key: str) -> list[str]:
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
                return sorted(models, reverse=True)  # Sort newer models higher
    except Exception as e:
        logger.warning(f"Failed to fetch OpenAI models: {e}")
    return []


async def fetch_anthropic_models(api_key: str) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
            res = await client.get(
                "https://api.anthropic.com/v1/models", headers=headers
            )
            if res.status_code == 200:
                data = res.json()
                models = [m["id"] for m in data.get("data", [])]
                return sorted(models)
    except Exception as e:
        logger.warning(f"Failed to fetch Anthropic models: {e}")
    # Fallback to standard hardcoded list if the Model API endpoint isn't working/available
    return [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307",
        "claude-3-sonnet-20240229",
    ]


async def fetch_gemini_models(api_key: str) -> list[str]:
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
                return sorted(models, reverse=True)
    except Exception as e:
        logger.warning(f"Failed to fetch Gemini models: {e}")
    return []


@router.get("/models")
async def get_available_models(db: Session = Depends(get_db)):
    """
    Returns a unified list of providers and their available models
    based on the API keys currently configured in the database,
    plus Ollama (which runs locally/host without a key).
    """
    settings = db.query(schema.GlobalSettings).first()

    # 1. Check Ollama depending on config
    ollama_url = (
        settings.ollama_base_url
        if settings and settings.ollama_base_url
        else os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    )
    ollama_models = await fetch_ollama_models(ollama_url)

    providers = []

    if ollama_models is not None:
        providers.append({"provider": "ollama", "models": ollama_models})
    else:
        # If None, it means connection failed. We don't add it to providers.
        pass

    # 2. Check Cloud Providers if keys exist
    if settings:
        if settings.openai_api_key:
            providers.append(
                {
                    "provider": "openai",
                    "models": await fetch_openai_models(settings.openai_api_key),
                }
            )

        if settings.anthropic_api_key:
            providers.append(
                {
                    "provider": "anthropic",
                    "models": await fetch_anthropic_models(settings.anthropic_api_key),
                }
            )

        if settings.google_api_key:
            providers.append(
                {
                    "provider": "gemini",
                    "models": await fetch_gemini_models(settings.google_api_key),
                }
            )

    return providers
