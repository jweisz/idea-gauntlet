"""Sync the global agent pool from the bundled presets.

`app/agents/presets/*.md` is the single source of truth for the boss roster:
this reconciles the `agents` table against it on every boot — a new preset
file becomes a new boss, a removed one retires its boss, and any edited field
on a still-present file overwrites the DB row. Matched by name (unique).

A boss with real game history (referenced by a BattleBoss row) can't be
hard-deleted without breaking that history's foreign key, so removal is
skipped — and logged — for those; every other boss stays fully in sync.
"""

import logging

from sqlalchemy.exc import IntegrityError

from ..models.db import SessionLocal
from ..models.schema import Agent, GlobalSettings
from ..core.llm import detect_local_ollama_url
from .prompt_loader import prompt_loader

logger = logging.getLogger(__name__)


def sync_agents_from_presets() -> None:
    presets = prompt_loader.list_prompts()
    if not presets:
        logger.warning("No agent presets found on disk; leaving `agents` untouched.")
        return
    preset_by_name = {p["name"]: p for p in presets}

    db = SessionLocal()
    try:
        existing = {a.name: a for a in db.query(Agent).all()}
        max_sort_order = max((a.sort_order for a in existing.values()), default=0)

        added = updated = 0
        for name, p in preset_by_name.items():
            agent = existing.get(name)
            if agent is None:
                max_sort_order += 1
                db.add(
                    Agent(
                        name=name,
                        emoji=p.get("emoji", "🤖"),
                        role_description=p.get("role_description", ""),
                        relevance_instructions=p.get("relevance_instructions", ""),
                        system_prompt=p.get("system_prompt", ""),
                        sort_order=max_sort_order,
                    )
                )
                added += 1
            else:
                agent.emoji = p.get("emoji", "🤖")
                agent.role_description = p.get("role_description", "")
                agent.relevance_instructions = p.get("relevance_instructions", "")
                agent.system_prompt = p.get("system_prompt", "")
                updated += 1
        db.commit()

        removed = skipped = 0
        for name, agent in existing.items():
            if name in preset_by_name:
                continue
            try:
                with db.begin_nested():
                    db.delete(agent)
                    db.flush()
                removed += 1
            except IntegrityError:
                db.rollback()
                skipped += 1
                logger.warning(
                    "Boss preset '%s' was removed from disk but has existing "
                    "game history; keeping its DB row instead of deleting it.",
                    name,
                )
        db.commit()

        logger.info(
            "Synced boss roster from presets: %d added, %d updated, %d removed%s.",
            added,
            updated,
            removed,
            f" ({skipped} skipped — still in use)" if skipped else "",
        )
    finally:
        db.close()


def seed_ollama_settings_if_fresh() -> None:
    """On a brand-new database (no settings row at all yet), check whether
    Ollama is already reachable locally and, if so, wire its base URL into a
    new GlobalSettings row so it shows up as an available provider immediately.

    Only runs when there is no settings row yet — an existing row (even one
    still holding defaults) is left untouched, since the user may have made
    choices we shouldn't second-guess after the fact.
    """
    db = SessionLocal()
    try:
        if db.query(GlobalSettings).first() is not None:
            return

        url = detect_local_ollama_url()
        if url:
            db.add(GlobalSettings(ollama_base_url=url))
            db.commit()
            logger.info(
                "Detected local Ollama at %s; configured it as the default provider.",
                url,
            )
    finally:
        db.close()
