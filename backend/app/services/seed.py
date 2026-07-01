"""Seed the global agent pool from the bundled presets.

The gauntlet needs a pool of agents to draw its 8 bosses from. A fresh database
has an empty `agents` table, which would leave the challenger-select grid empty.
This seeds the presets in `app/agents/presets/` on first boot (only when the
table is empty), so the game is playable out of the box. Idempotent: it does
nothing once any agents exist, so user edits are never overwritten.
"""

import logging

from ..models.db import SessionLocal
from ..models.schema import Agent
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
