import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from app.models.db import engine, Base
from app.api.settings import router as settings_router
from app.api.auth import router as auth_router
from app.api.agents import router as agents_router
from app.api.avatars import router as avatars_router
from app.api.providers import router as providers_router
from app.api.gauntlet import router as gauntlet_router
from app.api.config import router as config_router
from app.api.leaderboard import router as leaderboard_router
from app.core.config import allowed_origins
from app.services.seed import seed_default_agents, seed_ollama_settings_if_fresh

# Create tables on startup if they don't exist.
Base.metadata.create_all(bind=engine)

# Seed the agent pool from presets on a fresh database, so the gauntlet has
# bosses to draw from out of the box. No-op once any agents exist.
seed_default_agents()

# On a brand-new database, auto-detect an already-running local Ollama and
# wire it in as a provider. No-op once any settings row exists.
seed_ollama_settings_if_fresh()

logger = logging.getLogger(__name__)

app = FastAPI(title="Idea Gauntlet Backend", version="1.0.0")

# Configure CORS. Origins come from ALLOWED_ORIGINS (comma-separated) in
# production; defaults to the local Vite dev servers when unset.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Turn any unhandled exception into a normal JSON 500.

    Without this, an unhandled exception unwinds past CORSMiddleware entirely
    (Starlette's default 500 response is built by the outermost error
    middleware, which never runs back through CORSMiddleware), so the
    response reaches the browser with no CORS headers. The browser then
    can't read the status or body at all and the fetch() call itself rejects
    with an opaque network error ("Load failed" in Safari, "Failed to fetch"
    in Chrome) — hiding whatever actually went wrong. Handling the exception
    here keeps the response flowing through CORSMiddleware normally.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


def _health_payload() -> dict:
    return {
        "status": "ok",
        "version": "1.0.0",
        "endpoints": [
            "/api/gauntlet/sessions",
            "/api/leaderboard",
            "/api/settings",
            "/api/auth",
            "/api/health",
        ],
    }


@app.get("/api/health", tags=["Meta"])
def health_check():
    return _health_payload()


app.include_router(settings_router)
app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(avatars_router)
app.include_router(providers_router)
app.include_router(config_router)
app.include_router(gauntlet_router)
app.include_router(leaderboard_router)
