"""
LLM usage metering.

After each model call we record token counts and an estimated USD cost into the
``usage_events`` table. Attribution (principal + session id) is carried in a
ContextVar set per request by a router-level dependency, so individual service
functions don't need to thread it through.

This is shared (self-host gets local cost visibility); the hosted overlay reads
``usage_events`` for its monthly spend kill-switch and per-user abuse review.
"""

import contextvars
import logging
from dataclasses import dataclass

from litellm.exceptions import BadRequestError
from sqlalchemy.orm import Session

from ..models.db import SessionLocal
from ..models.schema import UsageEvent

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class UsageContext:
    principal: str | None = None
    session_id: int | None = None
    # The active request's DB session, when metering runs inside one. Reused so
    # the usage insert joins the request's transaction instead of opening a
    # second connection (see record_usage).
    db: Session | None = None


_usage_ctx: contextvars.ContextVar[UsageContext] = contextvars.ContextVar(
    "usage_ctx", default=UsageContext()
)


def set_usage_context(
    principal: str | None = None,
    session_id: int | None = None,
    db: Session | None = None,
) -> None:
    _usage_ctx.set(UsageContext(principal=principal, session_id=session_id, db=db))


# Approximate USD price per 1M tokens, matched by substring of the model string
# (input, output). Unknown models fall back to (0, 0) so metering never errors;
# add entries as you adopt new models.
_PRICES_PER_MTOK: list[tuple[str, tuple[float, float]]] = [
    ("claude-opus", (5.0, 25.0)),
    ("claude-sonnet", (3.0, 15.0)),
    ("claude-haiku", (1.0, 5.0)),
    ("gpt-4o-mini", (0.15, 0.60)),
    ("gpt-4o", (2.5, 10.0)),
    ("gemini-2.0-flash", (0.10, 0.40)),
    ("gemini-1.5-pro", (1.25, 5.0)),
]


def _price_for(model: str) -> tuple[float, float]:
    needle = (model or "").lower()
    for fragment, price in _PRICES_PER_MTOK:
        if fragment in needle:
            return price
    return (0.0, 0.0)


def _extract_tokens(message) -> tuple[int, int]:
    """Pull (input_tokens, output_tokens) from a LangChain response message.

    Prefers the standardized ``usage_metadata``; falls back to provider
    ``response_metadata.token_usage``. Returns (0, 0) when unavailable (e.g.
    some streaming paths) so metering degrades gracefully rather than failing.
    """
    usage = getattr(message, "usage_metadata", None)
    if isinstance(usage, dict) and usage:
        return int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))

    meta = getattr(message, "response_metadata", None)
    if isinstance(meta, dict):
        tu = meta.get("token_usage") or meta.get("usage") or {}
        if isinstance(tu, dict) and tu:
            return (
                int(tu.get("prompt_tokens", tu.get("input_tokens", 0)) or 0),
                int(tu.get("completion_tokens", tu.get("output_tokens", 0)) or 0),
            )
    return (0, 0)


def record_usage(message, provider: str, model: str) -> None:
    """Persist a UsageEvent for one completed model call. Never raises."""
    try:
        in_tok, out_tok = _extract_tokens(message)
        in_price, out_price = _price_for(model)
        cost = (in_tok / 1_000_000) * in_price + (out_tok / 1_000_000) * out_price
        ctx = _usage_ctx.get()
        event = UsageEvent(
            principal=ctx.principal,
            session_id=ctx.session_id,
            provider=provider,
            model=model,
            input_tokens=in_tok,
            output_tokens=out_tok,
            est_cost_usd=round(cost, 6),
        )
        if ctx.db is not None:
            # Inside a request: piggyback on its session so this insert joins the
            # request's transaction rather than opening a second SQLite writer —
            # which would deadlock against the write lock the request already
            # holds (it's paused here, mid-handler, so it can't commit to release
            # it). Persisted when the request commits; dropped on rollback, which
            # is fine for best-effort metering. Add-only (no flush/commit) so we
            # never prematurely persist the handler's own pending writes.
            ctx.db.add(event)
        else:
            # No request context (e.g. background/seed work): own short-lived
            # session, committed immediately.
            db = SessionLocal()
            try:
                db.add(event)
                db.commit()
            finally:
                db.close()
    except Exception:
        logger.warning("usage metering failed", exc_info=True)


async def metered_ainvoke(llm, messages, *, provider: str, model: str):
    """``await llm.ainvoke(messages)`` plus usage recording. Returns the response."""
    try:
        response = await llm.ainvoke(messages)
    except BadRequestError as e:
        # Some newer models (seen on Anthropic's latest generation) reject any
        # client-supplied `temperature` outright instead of just ignoring it,
        # which would otherwise fail every call for that model's lifetime.
        # Retry once with it unset before giving up.
        if "temperature" in str(e) and "deprecated" in str(e).lower():
            logger.warning(
                "Model %s/%s rejected `temperature`; retrying without it", provider, model
            )
            response = await llm.ainvoke(messages, temperature=None)
        else:
            raise
    record_usage(response, provider, model)
    return response
