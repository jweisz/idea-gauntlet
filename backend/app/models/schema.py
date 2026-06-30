import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Float,
)
from sqlalchemy.orm import relationship
from .db import Base


class User(Base):
    """Single user profile populated via Google OAuth."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    openai_api_key = Column(String, nullable=True)
    anthropic_api_key = Column(String, nullable=True)
    google_api_key = Column(String, nullable=True)
    ollama_base_url = Column(String, default="http://host.docker.internal:11434")
    # Stored as JSON string
    theme_preferences = Column(Text, nullable=True)

    default_agent_turn_budget = Column(Integer, default=3)
    global_system_instruction = Column(Text, nullable=True)
    non_agent_provider = Column(String, nullable=True)
    non_agent_model = Column(String, nullable=True)


class Agent(Base):
    """Global pool of agent blueprints."""

    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    role_description = Column(Text, nullable=False)
    relevance_instructions = Column(Text, nullable=False, default="")
    system_prompt = Column(Text, nullable=False)
    avatar_url = Column(String, nullable=True)
    emoji = Column(String, default="🤖")

    token_budget = Column(Integer, default=3)
    provider = Column(String, default="openai")  # e.g. openai, anthropic
    model = Column(String, default="gpt-4o")


# ---------------------------------------------------------------------------
# Idea Gauntlet tables
# ---------------------------------------------------------------------------


class GauntletSession(Base):
    """A single 'idea gauntlet' run: the user defends one idea against 8 agents."""

    __tablename__ = "gauntlet_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    idea = Column(Text, nullable=False)
    agent_ids = Column(Text, nullable=False)  # JSON list of 8 agent IDs
    status = Column(String, default="active", nullable=False)  # "active" | "complete"
    difficulty = Column(String, default="difficult", nullable=False)  # "easy" | "normal" | "difficult"
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    bosses = relationship(
        "BattleBoss", back_populates="session", cascade="all, delete-orphan"
    )


class BattleBoss(Base):
    """One agent-vs-user battle within a GauntletSession."""

    __tablename__ = "battle_bosses"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("gauntlet_sessions.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False)
    status = Column(
        String, default="pending", nullable=False
    )  # "pending" | "active" | "defeated" | "failed"
    user_hp = Column(Integer, default=100, nullable=False)
    agent_hp = Column(Integer, default=100, nullable=False)
    provider_override = Column(
        String, nullable=True
    )  # overrides agent.provider for this battle
    model_override = Column(
        String, nullable=True
    )  # overrides agent.model for this battle

    session = relationship("GauntletSession", back_populates="bosses")
    agent = relationship("Agent")
    messages = relationship(
        "BattleMessage", back_populates="boss", cascade="all, delete-orphan"
    )


class UsageEvent(Base):
    """One metered LLM call.

    Written by app/core/usage.py after each model invocation. Powers the
    developer spend dashboard and the hosted monthly spend kill-switch. Useful
    in self-host too (local cost visibility); the gate/alerting on top is
    hosted-only.
    """

    __tablename__ = "usage_events"

    id = Column(Integer, primary_key=True, index=True)
    principal = Column(String, nullable=True, index=True)  # acting user, if known
    session_id = Column(Integer, nullable=True, index=True)  # GauntletSession.id, if known
    provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    input_tokens = Column(Integer, default=0, nullable=False)
    output_tokens = Column(Integer, default=0, nullable=False)
    est_cost_usd = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)


class LeaderboardEntry(Base):
    """An opt-in, immutable snapshot of a completed game published to the leaderboard.

    Snapshotted at publish time so the leaderboard is cheap to query and stable
    even if the underlying session changes. One entry per session (unique).
    Publishing is explicit and discloses exactly these fields.
    """

    __tablename__ = "leaderboard_entries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer, ForeignKey("gauntlet_sessions.id"), unique=True, nullable=False
    )
    principal = Column(String, nullable=False, index=True)  # owner (for unpublish)
    user_display_name = Column(String, nullable=False)
    idea = Column(Text, nullable=False)
    defense_summary = Column(Text, nullable=False)
    defeated_bosses = Column(Text, nullable=False)  # JSON list of names
    difficulty = Column(String, nullable=False)
    bosses_defeated = Column(Integer, default=0, nullable=False)
    total_bosses = Column(Integer, default=0, nullable=False)
    avg_turns_per_boss = Column(Float, default=0.0, nullable=False)
    avg_damage_per_attack = Column(Float, default=0.0, nullable=False)
    score = Column(Integer, default=0, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class BattleMessage(Base):
    """A single turn in a BattleBoss conversation."""

    __tablename__ = "battle_messages"

    id = Column(Integer, primary_key=True, index=True)
    boss_id = Column(Integer, ForeignKey("battle_bosses.id"), nullable=False)
    role = Column(String, nullable=False)  # "user" | "agent"
    content = Column(Text, nullable=False)
    damage = Column(Integer, nullable=True)  # HP damage dealt to the opposing side
    damage_reason = Column(
        Text, nullable=True
    )  # one-line judge rationale for the score
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    boss = relationship("BattleBoss", back_populates="messages")
