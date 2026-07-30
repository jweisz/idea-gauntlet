# 🥊 Idea Gauntlet

**Pitch an idea. Survive a gauntlet of AI critics. One has to break before the
other.**

Idea Gauntlet turns "defend your idea" into a turn-based boss rush. You enter a
single idea, then face a lineup of AI bosses — a skeptic, a pragmatist, a
visionary, and more — one battle at a time. Every argument you land chips away
at the boss's HP; every hole they poke chips away at yours. Make your case well
enough, and you advance. Run out of HP, and the gauntlet ends.

It's part debate trainer, part roguelike. The better your reasoning, the harder
you hit.

______________________________________________________________________

## How it works

- **You vs. 3 to 8 bosses, back to back.** Each boss is a distinct AI persona
  with its own angle of attack. Beat one, the next steps up.
- **Arguments deal damage.** An LLM judge scores each exchange and converts it
  to HP — a weak point still lands a hit (min 12), a genuinely devastating
  argument deals up to 40. Both sides have 100 HP.
- **Difficulty sets the length, the layout, and the math.** (All in
  `config.toml`.)

  | | Bosses | Layout | You deal | You take |
  |---|---|---|---|---|
  | *Easy* | 3 | in order | 1.5× | 0.75× |
  | *Normal* | 5 | in order | 1.2× | 0.9× |
  | *Difficult* | 7 | in order | 1.0× | 1.0× |
  | *Insane* | 8 | pick any boss, any order | 0.9× | 1.15× |

  The first three are a true gauntlet — you fight the lineup front to back, and
  you can see who's coming. *Insane* is the Mega Man one: the whole roster is
  open from the start, and you choose the order.
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
mise run mdformat       # auto-format markdown (prettier + mdformat)
mise run lint           # eslint + ruff
mise run test           # frontend type-check + backend pytest
mise run build          # full local gate: format + lint + test + typecheck
```

## Configuration

Three tiers, by how often a value changes and how secret it is:

| Tier | Examples | Where |
|------|----------|-------|
| **Static tuning** | display name, HP, damage range, input caps, difficulty tiers | `backend/app/config.toml` |
| **Secrets / per-deployment** | LLM API keys, `JWT_SECRET_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS` | environment (`backend/.env.example`) |
| **Runtime, user-editable** | per-agent provider + model, keys | the database, via the Settings modal |

Want to rebrand the game? Change `[branding].name` in `config.toml` — it flows
through the UI automatically.

Each `[gameplay.difficulty.*]` tier takes `bosses` (how many critics),
`progression` (`"linear"` to fight them in order, `"free"` to pick any), and the
`user` / `boss` damage multipliers. The frontend reads these from `/api/config`
rather than hardcoding them, so retuning a tier only takes a backend restart.
One caveat: don't give a `"linear"` tier `bosses = 8`. Games created before
gauntlet length was variable are all 8-boss free-choice runs, and they're
recognised by their roster length not matching their tier's — an 8-boss linear
tier would misfile those saves as new ones.

## Running your own instance

Idea Gauntlet is two pieces: the FastAPI backend and the static frontend build
(`npm run build` → `frontend/dist`, served by any static host or the same box).

- **Database.** SQLite is the zero-config default for local runs. For anything
  shared or long-lived, set `DATABASE_URL` to a Postgres instance — `postgres://`
  / `postgresql://` URLs are normalized automatically.
- **LLM.** Provide a provider key via env (`ANTHROPIC_API_KEY`, etc.) plus
  `LLM_PROVIDER` / `LLM_MODEL`. Set `LOCK_LLM_SETTINGS=true` to configure the
  model entirely from the environment and hide the in-app key/model fields.
- **Access.** The self-host build runs open (no accounts) — keep it on your own
  machine or network, or put it behind your own auth/proxy before exposing it.

See `backend/.env.example` for the full list of settings.

## License

Apache-2.0 — see [LICENSE](LICENSE). Run it, fork it, host it with your own keys.
