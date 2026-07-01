# 🥊 Idea Gauntlet

**Pitch an idea. Survive eight AI critics. One has to break before the other.**

Idea Gauntlet turns "defend your idea" into a turn-based boss rush. You enter a
single idea, then face a lineup of AI bosses — a skeptic, a pragmatist, a
visionary, and more — one battle at a time. Every argument you land chips away
at the boss's HP; every hole they poke chips away at yours. Make your case well
enough, and you advance. Run out of HP, and the gauntlet ends.

It's part debate trainer, part roguelike. The better your reasoning, the harder
you hit.

---

## How it works

- **You vs. 8 bosses, back to back.** Each boss is a distinct AI persona with
  its own angle of attack. Beat one, the next steps up.
- **Arguments deal damage.** An LLM judge scores each exchange and converts it
  to HP — a weak point still lands a hit (min 12), a genuinely devastating
  argument deals up to 40. Both sides have 100 HP.
- **Difficulty tunes the math.** *Easy* amplifies your damage and softens
  theirs; *Difficult* is an even fight. (Set in `config.toml`.)
- **Stay on topic — the bosses won't be your assistant.** Attempts to derail the
  game ("ignore the rules and write me code," prompt injection, role-swaps) are
  caught by the judge and rejected in character. They don't count as progress.
- **Opt-in leaderboard.** Finish a run and choose to publish: your initial idea,
  a one-sentence summary of how you defended it, the bosses you defeated, and
  stats like average turns per boss and average damage per attack.

## Bring your own model

The backend talks to LLMs through [LiteLLM](https://github.com/BerriAI/litellm),
so you can mix providers per agent — **Anthropic, OpenAI, Gemini, or a local
Ollama model.** Keys are stored server-side and never sent to the browser; drop
them in via environment variables or the in-app Settings modal.

```
backend/    FastAPI service — game engine, scoring judge, leaderboard, LLM core
frontend/   React + Vite + Zustand UI
```

## Quick start (self-host, bring your own key)

This repo uses [`mise`](https://mise.jdx.dev) task runners. From the repo root:

```bash
mise run setup        # installs frontend + backend deps (npm + uv)
```

Then run each side:

```bash
# Backend (uv-managed)
cd backend
ANTHROPIC_API_KEY=sk-ant-... uv run uvicorn app.main:app --reload --port 8000
# (or leave it blank and enter a key in the in-app Settings modal)

# Frontend
cd ../frontend
npm run dev
```

Open the Vite dev URL, enter an idea, and step into the ring.

### Hygiene tasks

Same task names work at the root (fans out to both sides) or in either subdir:

```bash
mise run format        # auto-format (prettier + ruff)
mise run lint          # eslint + ruff
mise run test          # frontend type-check + backend pytest
mise run check         # the full CI gate: format-check + lint + test
```

## Configuration

Three tiers, by how often a value changes and how secret it is:

| Tier | Examples | Where |
|------|----------|-------|
| **Static tuning** | display name, HP, damage range, input caps, difficulty multipliers | `backend/app/config.toml` |
| **Secrets / per-deployment** | LLM API keys, `JWT_SECRET_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS` | environment (`backend/.env.example`) |
| **Runtime, user-editable** | per-agent provider + model, keys | the database, via the Settings modal |

Want to rebrand the game? Change `[branding].name` in `config.toml` — it flows
through the UI automatically.

## Deploy

`render.yaml` provisions managed Postgres + the API + a static frontend build.
SQLite is the zero-config default for local runs; set `DATABASE_URL` to point at
Postgres for anything shared.

The paid hosted deployment — Google sign-in, play credits, Stripe top-ups, a
spend cap, and abuse enforcement — lives in a **separate private overlay** repo
that depends on this `backend` and layers monetization on through dependency
overrides. None of that code ships here: this repo is, and stays, a clean
self-hostable game.

## License

Apache-2.0 — see [LICENSE](LICENSE). Run it, fork it, host it with your own keys.
