from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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
from app.services.seed import seed_default_agents

# Create tables on startup if they don't exist.
Base.metadata.create_all(bind=engine)

# Seed the agent pool from presets on a fresh database, so the gauntlet has
# bosses to draw from out of the box. No-op once any agents exist.
seed_default_agents()

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
