"""
Extension seams — the boundary between the public core and the private hosted
overlay.

Each callable here is used via FastAPI's ``Depends(...)`` so the hosted overlay
can swap in its own implementation with ``app.dependency_overrides[...]`` without
any hosted code living in this (public) repository. The defaults below are the
self-host behavior: open access, no credits, no spend gate.

Overlay wiring (in the private repo) looks like:

    from app.main import app
    from app.core.deps import (
        get_current_principal, require_play_credit,
        accepting_new_players, get_app_config,
    )
    from hosted import auth, credits, config as hosted_config

    app.dependency_overrides[get_current_principal] = auth.google_multiuser_principal
    app.dependency_overrides[require_play_credit]    = credits.enforce_credit
    app.dependency_overrides[accepting_new_players]  = credits.spend_gate
    app.dependency_overrides[get_app_config]         = hosted_config.hosted_config
"""

from dataclasses import dataclass, field
from fastapi import Depends, HTTPException, Request, status

from .security import resolve_request_auth_context
from . import config


def get_current_principal(request: Request) -> str:
    """Resolve the acting user's principal (email-like string).

    Default (self-host): derive from the request auth context, falling back to
    ``"anonymous"``. The hosted overlay overrides this to require a verified
    Google identity and return the authenticated user's email.
    """
    ctx = resolve_request_auth_context(request)
    return ctx.principal or "anonymous"


def accepting_new_players() -> bool:
    """Whether the deployment is currently accepting *new* games.

    Default (self-host): always ``True``. The hosted overlay overrides this with
    a spend-cap gate; when it returns ``False``, new games are refused and the
    frontend shows the waitlist screen.
    """
    return True


def require_play_credit(principal: str = Depends(get_current_principal)) -> str:
    """Authorize (not charge) a new game, before it is created.

    Default (self-host): no-op — always allows, returns the principal. The
    hosted overlay overrides this to *check* the user may play (HTTP 402 when the
    balance is zero, 403 when suspended) WITHOUT debiting. The actual debit
    happens in ``settle_play`` after the game is successfully created, so a
    malformed/rejected request never consumes a credit.
    """
    return principal


def settle_play(principal: str, db=None) -> None:
    """Called after a new game is successfully created and committed.

    Default (self-host): no-op. The hosted overlay replaces this attribute
    (``app.core.deps.settle_play = ...`` at import) to debit one credit. Pairs
    with the ``require_play_credit`` authorize check. Implementations must not
    raise — a created game should never fail on the debit step.
    """
    return None


@dataclass
class GuardResult:
    """Outcome of misuse / jailbreak detection on a player turn.

    Produced by the core (see app/services/gauntlet.py scoring) and consumed by
    the hosted overlay for enforcement (strikes / suspension). In self-host the
    only effect is the in-character rejection performed by the core.
    """

    flagged: bool = False
    label: str | None = None
    confidence: float = 0.0
    reason: str | None = None


def on_guard_result(
    principal: str, session_id: int | None, guard: "GuardResult", db=None
) -> None:
    """Hook fired when misuse detection flags a player turn.

    Default (self-host): no-op — the only effect of a flag is the in-character
    rejection performed by the route. The hosted overlay replaces this attribute
    (``app.core.deps.on_guard_result = ...`` at import time) to log an
    ``abuse_event`` and apply escalating strikes / suspension.
    """
    return None


def get_app_config() -> dict:
    """Feature flags surfaced to the frontend via ``GET /api/config``.

    Default (self-host): keys + model selection visible, no billing, players are
    always accepted. The hosted overlay overrides this to hide key/model
    settings, enable billing + leaderboard, and reflect the spend gate.
    """
    return {
        "game_name": config.game_name(),
        "auth": "local",
        "google_client_id": "",
        "billing_enabled": False,
        "show_api_key_settings": True,
        "show_model_selection": True,
        "leaderboard_enabled": True,
        "accepting_new_players": True,
    }
