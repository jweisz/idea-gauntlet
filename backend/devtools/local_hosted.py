"""Local stand-in for the private hosted overlay — dev only, never deployed.

The OSS core has no credits: ``get_app_config`` reports ``credits_enabled:
False`` and the frontend's credits badge never renders. That makes the paid-play
flow (gatekeeper charges → challenger select consumes) impossible to exercise
with ``uvicorn app.main:app``.

This module wires the same seams the real overlay uses — dependency overrides
plus attribute replacement, see ``app/core/deps.py`` — against an in-memory
balance, and serves the ``/api/credits`` routes the badge calls. Run it instead
of ``app.main``:

    cd backend && uv run uvicorn devtools.local_hosted:app --port 8000 --reload

Balance resets to ``STARTING_BALANCE`` on every restart; click the credits chip
in a dev build of the frontend to top up (``/api/credits/dev-grant``).
"""

from fastapi import Depends, HTTPException

from app.core import deps
from app.core.deps import get_app_config, get_current_principal, require_play_credit
from app.main import app

STARTING_BALANCE = 3
MONTHLY_GRANT = 3
DEV_GRANT_SIZE = 3
DEV_GRANT_MAX = 99

# Balances per principal. In-memory: this is a dev harness, not a ledger.
BALANCES: dict[str, int] = {}


def _balance(principal: str) -> int:
    return BALANCES.setdefault(principal, STARTING_BALANCE)


def hosted_config() -> dict:
    """Everything the core reports, plus the credits the overlay adds."""
    cfg = dict(deps.get_app_config())
    cfg["credits_enabled"] = True
    return cfg


def enforce_credit(principal: str = Depends(get_current_principal)) -> str:
    """Authorize a play — 402 on an empty balance. Charging happens at START."""
    if _balance(principal) <= 0:
        raise HTTPException(
            status_code=402,
            detail="You're out of plays. Click the credits chip to grant more.",
        )
    return principal


def debit_play(principal: str, db=None) -> None:
    """Charge for the game that just started."""
    BALANCES[principal] = _balance(principal) - 1


app.dependency_overrides[get_app_config] = hosted_config
app.dependency_overrides[require_play_credit] = enforce_credit
deps.settle_play = debit_play


def _credits_payload(principal: str) -> dict:
    return {
        "balance": _balance(principal),
        "monthly_grant": MONTHLY_GRANT,
        "billing_enabled": False,
    }


@app.get("/api/credits/me")
def credits_me(principal: str = Depends(get_current_principal)) -> dict:
    return _credits_payload(principal)


@app.post("/api/credits/dev-grant")
def dev_grant(principal: str = Depends(get_current_principal)) -> dict:
    """Top-up the credits badge calls when clicked in a dev build."""
    BALANCES[principal] = min(DEV_GRANT_MAX, _balance(principal) + DEV_GRANT_SIZE)
    return _credits_payload(principal)
