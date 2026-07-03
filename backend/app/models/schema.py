import datetime
from sqlalchemy import (
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
    Float,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class User(Base):
    """Single user profile populated via Google OAuth."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"))
    openai_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    anthropic_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    google_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    ollama_base_url: Mapped[str] = mapped_column(
        String, default="http://localhost:11434"
    )
    # Stored as JSON string
    theme_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)

    default_agent_turn_budget: Mapped[int] = mapped_column(Integer, default=3)
    global_system_instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String, nullable=True)


class Agent(Base):
    """Global pool of agent blueprints."""

    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    role_description: Mapped[str] = mapped_column(Text)
    relevance_instructions: Mapped[str] = mapped_column(Text, default="")
    system_prompt: Mapped[str] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    emoji: Mapped[str] = mapped_column(String, default="🤖")

    token_budget: Mapped[int] = mapped_column(Integer, default=3)


# ---------------------------------------------------------------------------
# Idea Gauntlet tables
# ---------------------------------------------------------------------------


class GauntletSession(Base):
    """A single 'idea gauntlet' run: the user defends one idea against 8 agents."""

    __tablename__ = "gauntlet_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    idea: Mapped[str] = mapped_column(Text)
    agent_ids: Mapped[str] = mapped_column(Text)  # JSON list of 8 agent IDs
    # "active" | "complete"
    status: Mapped[str] = mapped_column(String, default="active")
    # "easy" | "normal" | "difficult"
    difficulty: Mapped[str] = mapped_column(String, default="normal")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    bosses: Mapped[list["BattleBoss"]] = relationship(
        "BattleBoss", back_populates="session", cascade="all, delete-orphan"
    )


class BattleBoss(Base):
    """One agent-vs-user battle within a GauntletSession."""

    __tablename__ = "battle_bosses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("gauntlet_sessions.id"))
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"))
    # "pending" | "active" | "defeated" | "failed"
    status: Mapped[str] = mapped_column(String, default="pending")
    user_hp: Mapped[int] = mapped_column(Integer, default=100)
    agent_hp: Mapped[int] = mapped_column(Integer, default=100)

    session: Mapped["GauntletSession"] = relationship(
        "GauntletSession", back_populates="bosses"
    )
    agent: Mapped["Agent"] = relationship("Agent")
    messages: Mapped[list["BattleMessage"]] = relationship(
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # acting user, if known
    principal: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    # GauntletSession.id, if known
    session_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    est_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, index=True
    )


class LeaderboardEntry(Base):
    """An opt-in, immutable snapshot of a completed game published to the leaderboard.

    Snapshotted at publish time so the leaderboard is cheap to query and stable
    even if the underlying session changes. One entry per session (unique).
    Publishing is explicit and discloses exactly these fields.
    """

    __tablename__ = "leaderboard_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("gauntlet_sessions.id"), unique=True
    )
    # owner (for unpublish)
    principal: Mapped[str] = mapped_column(String, index=True)
    user_display_name: Mapped[str] = mapped_column(String)
    idea: Mapped[str] = mapped_column(Text)
    defense_summary: Mapped[str] = mapped_column(Text)
    defeated_bosses: Mapped[str] = mapped_column(Text)  # JSON list of names
    difficulty: Mapped[str] = mapped_column(String)
    bosses_defeated: Mapped[int] = mapped_column(Integer, default=0)
    total_bosses: Mapped[int] = mapped_column(Integer, default=0)
    avg_turns_per_boss: Mapped[float] = mapped_column(Float, default=0.0)
    avg_damage_per_attack: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )


class BattleMessage(Base):
    """A single turn in a BattleBoss conversation."""

    __tablename__ = "battle_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    boss_id: Mapped[int] = mapped_column(Integer, ForeignKey("battle_bosses.id"))
    role: Mapped[str] = mapped_column(String)  # "user" | "agent"
    content: Mapped[str] = mapped_column(Text)
    # HP damage dealt to the opposing side
    damage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # one-line judge rationale for the score
    damage_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    boss: Mapped["BattleBoss"] = relationship("BattleBoss", back_populates="messages")
