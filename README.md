# Idea Gauntlet

Defend an idea against 8 AI critics, one battle at a time. A standalone game,
split out from the TFT Arena project (which keeps the multi-agent chat room).

```
backend/    FastAPI backend (gauntlet + leaderboard + shared agent/settings/LLM core)
frontend/   React + Vite UI
```

The paid hosted deployment (Google sign-in, credits, Stripe, spend cap, abuse
enforcement) lives in the separate **private** `idea-gauntlet-overlay` repo,
which depends on this `backend` and layers on via dependency overrides — so no
monetization code ships here.

## Run it (self-host, BYO key)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
ANTHROPIC_API_KEY=sk-ant-... uvicorn app.main:app --reload --port 8000
# (or enter a key in the in-app Settings modal)

# Frontend
cd ../frontend
npm install
npm run dev
```

## Configuration
- **Static tuning** (display name, gameplay HP/damage/caps, difficulty) →
  `backend/app/config.toml`.
- **Secrets / per-deployment** (API keys, `JWT_SECRET_KEY`, `DATABASE_URL`,
  `ALLOWED_ORIGINS`) → environment variables (see `backend/.env.example`).
- **Runtime, editable** (per-agent model, keys) → the database, via the Settings
  modal.

Deploy with `render.yaml` (managed Postgres + API + static frontend).

## License

Apache-2.0 — see [LICENSE](LICENSE). Run it, fork it, host it with your own keys.
