"""Seed the global agent pool from the bundled presets.

The gauntlet needs a pool of agents to draw its 8 bosses from. A fresh database
has an empty `agents` table, which would leave the challenger-select grid empty.
This seeds the presets in `app/agents/presets/` on first boot (only when the
table is empty), so the game is playable out of the box. Idempotent: it does
nothing once any agents exist, so user edits are never overwritten.
"""

import logging

from ..models.db import SessionLocal
from ..models.schema import Agent, GlobalSettings
from ..core.llm import detect_local_ollama_url
from .prompt_loader import prompt_loader

logger = logging.getLogger(__name__)


def seed_default_agents() -> None:
    db = SessionLocal()
    try:
        if db.query(Agent).count() > 0:
            return

        presets = prompt_loader.list_prompts()
        if not presets:
            logger.warning("No agent presets found to seed.")
            return

        for i, p in enumerate(presets):
            db.add(
                Agent(
                    name=p["name"],
                    emoji=p.get("emoji", "🤖"),
                    role_description=p.get("role_description", ""),
                    relevance_instructions=p.get("relevance_instructions", ""),
                    system_prompt=p.get("system_prompt", ""),
                    sort_order=i,
                )
            )
        db.commit()
        logger.info("Seeded %d default agents from presets.", len(presets))
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
