"""
Idea Gauntlet API endpoints.

Routes:
  GET  /api/gauntlet/agents/random              - 8 randomly sampled agents
  POST /api/gauntlet/sessions                   - Start a new game session
  GET  /api/gauntlet/sessions/{id}              - Fetch session state
  POST /api/gauntlet/sessions/{id}/battles/{boss_id}/message  - Battle turn
  POST /api/gauntlet/sessions/{id}/summary      - Generate final synthesis
"""

import json
import logging
import random
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload, selectinload
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

from ..models.db import get_db
from ..models.schema import (
    Agent,
    GauntletSession,
    BattleBoss,
    BattleMessage,
    LeaderboardEntry,
)
from ..core.deps import (
    get_current_principal,
    require_play_credit,
    accepting_new_players,
    GuardResult,
)
from ..core.usage import set_usage_context
from ..services.gauntlet import (
    get_agent_reply,
    score_exchange,
    check_idea,
    get_concession_message,
    get_defeat_reason,
    generate_summary,
    generate_boss_summary,
    generate_objections,
    generate_defense_summary,
    compute_session_stats,
    apply_difficulty,
    MAX_HP,
    MAX_IDEA_CHARS,
    MAX_ATTACK_CHARS,
)

# Imported as a module (not by-name) so the hosted overlay's override of
# ``on_guard_result`` is picked up at call time.
from ..core import deps

logger = logging.getLogger(__name__)


async def _get_agent_reply_or_502(*, agent, idea, battle_messages):
    """Call get_agent_reply, turning a failure into a clear 502.

    get_agent_reply has no fallback — a boss with no working model has no
    reply to give. A bare 500 would bury that; this raises an actionable
    error telling the player to check their API key / model settings.
    """
    try:
        return await get_agent_reply(
            agent=agent,
            idea=idea,
            battle_messages=battle_messages,
        )
    except Exception:
        logger.warning(
            "Agent reply LLM call failed for agent_id=%s", agent.id, exc_info=True
        )
        raise HTTPException(
            status_code=502,
            detail=f"{agent.name}'s model is unavailable right now (no working AI "
            "model configured for this critic). Check your API key / model "
            "settings and try again.",
        )


def _attach_usage_context(
    request: Request,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> None:
    """Stamp LLM usage with the acting user + session for the duration of the request.

    Runs for every gauntlet route; session_id is read from the path when present
    (battle/summary routes) so metered calls in the service layer are attributed
    without threading args through every function. The request's ``db`` (the same
    cached Session the handler receives) is stashed too, so ``record_usage`` can
    write on it instead of opening a competing connection.
    """
    raw = request.path_params.get("session_id")
    try:
        session_id = int(raw) if raw is not None else None
    except (TypeError, ValueError):
        session_id = None
    set_usage_context(principal=principal, session_id=session_id, db=db)


router = APIRouter(
    prefix="/api/gauntlet",
    tags=["Gauntlet"],
    dependencies=[Depends(_attach_usage_context)],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class AgentSummary(BaseModel):
    id: int
    name: str
    emoji: str
    role_description: str

    model_config = ConfigDict(from_attributes=True)


class BattleMessageOut(BaseModel):
    id: int
    role: str
    content: str
    damage: Optional[int]
    damage_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BattleBossOut(BaseModel):
    id: int
    agent_id: int
    status: str
    user_hp: int
    agent_hp: int
    agent: AgentSummary
    messages: List[BattleMessageOut] = []

    model_config = ConfigDict(from_attributes=True)


class SessionOut(BaseModel):
    id: int
    idea: str
    agent_ids: str
    status: str
    difficulty: str
    summary: Optional[str]
    created_at: datetime
    bosses: List[BattleBossOut] = []

    model_config = ConfigDict(from_attributes=True)


class SessionListItem(BaseModel):
    """Lightweight session summary for the 'Your Games' list (no battle messages)."""

    id: int
    idea: str
    status: str
    difficulty: str
    has_summary: bool
    created_at: datetime
    bosses_defeated: int
    total_bosses: int


class LeaderboardEntryOut(BaseModel):
    id: int
    session_id: int
    user_display_name: str
    idea: str
    defense_summary: str
    defeated_bosses: List[str]
    difficulty: str
    bosses_defeated: int
    total_bosses: int
    avg_turns_per_boss: float
    avg_damage_per_attack: float
    score: int
    created_at: datetime


def _entry_to_out(e: LeaderboardEntry) -> "LeaderboardEntryOut":
    try:
        names = json.loads(e.defeated_bosses)
    except (TypeError, ValueError):
        names = []
    return LeaderboardEntryOut(
        id=e.id,
        session_id=e.session_id,
        user_display_name=e.user_display_name,
        idea=e.idea,
        defense_summary=e.defense_summary,
        defeated_bosses=names,
        difficulty=e.difficulty,
        bosses_defeated=e.bosses_defeated,
        total_bosses=e.total_bosses,
        avg_turns_per_boss=e.avg_turns_per_boss,
        avg_damage_per_attack=e.avg_damage_per_attack,
        score=e.score,
        created_at=e.created_at,
    )


class CreateSessionRequest(BaseModel):
    idea: str
    agent_ids: List[int]  # exactly 8
    difficulty: str = "normal"  # "easy" | "normal" | "difficult"


class SendMessageRequest(BaseModel):
    content: str


class IdeaCheckRequest(BaseModel):
    idea: str


class IdeaCheckOut(BaseModel):
    passed: bool
    category: str
    reason: str


class StoreSummaryRequest(BaseModel):
    data: Optional[str] = None  # pre-assembled JSON string; if set, stored directly


class BattleTurnOut(BaseModel):
    agent_reply: str
    user_damage: int  # damage dealt TO the agent (user's attack)
    user_damage_reason: Optional[str] = None
    agent_damage: int  # damage dealt TO the user (agent's counter)
    agent_damage_reason: Optional[str] = None
    user_hp: int
    agent_hp: int
    battle_over: bool
    winner: Optional[str]  # "user" | "agent" | None
    defeat_reason: Optional[str] = None  # set only when winner == "agent"


class BattleOpeningOut(BaseModel):
    agent_reply: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/agents/random", response_model=List[AgentSummary])
def random_agents(count: int = 8, db: Session = Depends(get_db)):
    """Return up to `count` randomly sampled agents from the global pool."""
    all_agents = db.query(Agent).all()
    if not all_agents:
        return []
    sample = random.sample(all_agents, min(count, len(all_agents)))
    return sample


@router.post("/idea-check", response_model=IdeaCheckOut)
async def idea_check(
    body: IdeaCheckRequest,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Gatekeeper check: is this a defensible debate position, free of misuse?

    Called by the frontend before a session is created. No credit is charged
    and no session exists yet, so a flagged prompt-injection attempt is still
    reported to the abuse hook (session_id=None) for hosted-overlay tracking.
    """
    idea = body.idea.strip()
    if not idea:
        raise HTTPException(status_code=400, detail="Idea cannot be empty")
    if len(idea) > MAX_IDEA_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Idea is too long (max {MAX_IDEA_CHARS} characters)",
        )

    try:
        result = await check_idea(idea)
    except Exception:
        # No working judge model (missing/invalid provider key, model unreachable,
        # malformed response, etc.) — surface this as a visible failure rather than
        # silently waving every idea through the gate.
        raise HTTPException(
            status_code=502,
            detail="The gatekeeper is unavailable right now (no working AI model "
            "configured). Check your API key / model settings and try again.",
        )

    if result.category == "prompt_injection":
        deps.on_guard_result(
            principal=principal,
            session_id=None,
            guard=GuardResult(
                flagged=True,
                label="prompt_injection",
                confidence=1.0,
                reason=result.reason or None,
            ),
            db=db,
        )

    return IdeaCheckOut(
        passed=result.passed, category=result.category, reason=result.reason
    )


@router.post("/sessions", response_model=SessionOut)
def create_session(
    body: CreateSessionRequest,
    # require_play_credit authorizes (and, in the hosted overlay, debits) one
    # play and returns the principal. In self-host it is a no-op pass-through.
    principal: str = Depends(require_play_credit),
    # accepting_new_players reflects the hosted spend gate; False -> waitlist.
    accepting: bool = Depends(accepting_new_players),
    db: Session = Depends(get_db),
):
    if not accepting:
        raise HTTPException(
            status_code=503,
            detail="Idea Gauntlet is not accepting new players at this time.",
        )
    if not body.idea.strip():
        raise HTTPException(status_code=400, detail="Idea cannot be empty")
    if len(body.idea.strip()) > MAX_IDEA_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Idea is too long (max {MAX_IDEA_CHARS} characters)",
        )
    if len(body.agent_ids) != 8:
        raise HTTPException(status_code=400, detail="Exactly 8 agent IDs required")

    # Verify all agents exist
    for aid in body.agent_ids:
        if not db.query(Agent).filter(Agent.id == aid).first():
            raise HTTPException(status_code=404, detail=f"Agent {aid} not found")

    valid_difficulties = {"easy", "normal", "difficult"}
    difficulty = (
        body.difficulty if body.difficulty in valid_difficulties else "difficult"
    )

    user_id = principal
    session = GauntletSession(
        user_id=user_id,
        idea=body.idea.strip(),
        agent_ids=json.dumps(body.agent_ids),
        status="active",
        difficulty=difficulty,
    )
    db.add(session)
    db.flush()  # get session.id

    for agent_id in body.agent_ids:
        boss = BattleBoss(
            session_id=session.id,
            agent_id=agent_id,
            status="pending",
            user_hp=MAX_HP,
            agent_hp=MAX_HP,
        )
        db.add(boss)

    db.commit()
    db.refresh(session)

    # Game created successfully — now charge for the play (no-op in self-host).
    deps.settle_play(principal=principal, db=db)

    # Eager-load relationships for response
    session = (
        db.query(GauntletSession)
        .options(joinedload(GauntletSession.bosses).joinedload(BattleBoss.agent))
        .filter(GauntletSession.id == session.id)
        .one()
    )
    return session


@router.get("/sessions", response_model=List[SessionListItem])
def list_sessions(
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """All of the current user's games, newest first, for the 'Your Games' list.

    Returns lightweight summaries (no battle transcripts) so players can resume
    an in-progress game or revisit a completed one's summary.
    """
    sessions = (
        db.query(GauntletSession)
        .options(selectinload(GauntletSession.bosses))
        .filter(GauntletSession.user_id == principal)
        .order_by(GauntletSession.created_at.desc(), GauntletSession.id.desc())
        .all()
    )
    return [
        SessionListItem(
            id=s.id,
            idea=s.idea,
            status=s.status,
            difficulty=s.difficulty,
            has_summary=bool(s.summary),
            created_at=s.created_at,
            bosses_defeated=sum(1 for b in s.bosses if b.status == "defeated"),
            total_bosses=len(s.bosses),
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(
    session_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    user_id = principal
    session = (
        db.query(GauntletSession)
        .options(
            selectinload(GauntletSession.bosses).options(
                joinedload(BattleBoss.agent),
                selectinload(BattleBoss.messages),
            )
        )
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post(
    "/sessions/{session_id}/battles/{boss_id}/opening", response_model=BattleOpeningOut
)
async def battle_opening(
    session_id: int,
    boss_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Generate the agent's opening challenge (boss strikes first).
    Idempotent: if the opening was already stored, returns it without calling the LLM again.
    """
    user_id = principal
    session = (
        db.query(GauntletSession)
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    boss = (
        db.query(BattleBoss)
        .options(joinedload(BattleBoss.agent), joinedload(BattleBoss.messages))
        .filter(BattleBoss.id == boss_id, BattleBoss.session_id == session_id)
        .first()
    )
    if not boss:
        raise HTTPException(status_code=404, detail="Battle not found")

    # Idempotent: return existing opening if already generated
    existing = next((m for m in boss.messages if m.role == "agent"), None)
    if existing:
        return BattleOpeningOut(agent_reply=existing.content)

    # Generate the opening challenge with no prior exchange (idea alone as context)
    agent_reply = await _get_agent_reply_or_502(
        agent=boss.agent,
        idea=session.idea,
        battle_messages=[],
    )

    db.add(
        BattleMessage(boss_id=boss.id, role="agent", content=agent_reply, damage=None)
    )

    if boss.status == "pending":
        boss.status = "active"

    db.commit()
    return BattleOpeningOut(agent_reply=agent_reply)


@router.post(
    "/sessions/{session_id}/battles/{boss_id}/message", response_model=BattleTurnOut
)
async def battle_message(
    session_id: int,
    boss_id: int,
    body: SendMessageRequest,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    user_id = principal
    session = (
        db.query(GauntletSession)
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "complete":
        raise HTTPException(status_code=400, detail="Session is already complete")

    boss = (
        db.query(BattleBoss)
        .options(joinedload(BattleBoss.agent), joinedload(BattleBoss.messages))
        .filter(BattleBoss.id == boss_id, BattleBoss.session_id == session_id)
        .first()
    )
    if not boss:
        raise HTTPException(status_code=404, detail="Battle not found")
    if boss.status == "defeated":
        raise HTTPException(status_code=400, detail="This boss is already defeated")

    # Mark battle as active on first message
    if boss.status == "pending":
        boss.status = "active"
        db.flush()

    user_content = body.content.strip()
    if not user_content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(user_content) > MAX_ATTACK_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Message is too long (max {MAX_ATTACK_CHARS} characters)",
        )

    # Store user message first (without damage yet; we score after getting reply)
    user_msg = BattleMessage(
        boss_id=boss.id,
        role="user",
        content=user_content,
    )
    db.add(user_msg)
    db.flush()

    # Reload messages for context (including the new user message)
    all_messages = (
        db.query(BattleMessage)
        .filter(BattleMessage.boss_id == boss.id)
        .order_by(BattleMessage.id.asc())
        .all()
    )

    agent_reply = await _get_agent_reply_or_502(
        agent=boss.agent,
        idea=session.idea,
        battle_messages=all_messages,
    )

    # Score the exchange (also classifies the user message for misuse)
    (
        user_damage,
        user_damage_reason,
        agent_damage,
        agent_damage_reason,
        guard,
    ) = await score_exchange(
        idea=session.idea,
        user_message=user_content,
        agent_reply=agent_reply,
    )

    # Misuse / jailbreak attempt: reject in-character, deal no damage, and make
    # no progress so the app can't be used as a free general-purpose LLM. The
    # overlay hook records the event and applies enforcement (no-op in self-host).
    if guard.flagged:
        deps.on_guard_result(
            principal=user_id, session_id=session_id, guard=guard, db=db
        )
        rejection = (
            "The critics refuse to take the bait — they only respond to a genuine "
            "defense of your idea. Stay on topic and make your case."
        )
        user_msg.damage = 0
        user_msg.damage_reason = None
        db.add(
            BattleMessage(
                boss_id=boss.id,
                role="agent",
                content=rejection,
                damage=0,
                damage_reason=None,
            )
        )
        db.commit()
        db.refresh(boss)
        return BattleTurnOut(
            agent_reply=rejection,
            user_damage=0,
            user_damage_reason=None,
            agent_damage=0,
            agent_damage_reason=None,
            user_hp=boss.user_hp,
            agent_hp=boss.agent_hp,
            battle_over=False,
            winner=None,
            defeat_reason=None,
        )

    # Apply difficulty multipliers to raw scores
    user_damage, agent_damage = apply_difficulty(
        user_damage, agent_damage, session.difficulty or "difficult"
    )

    # If the player's attack kills the boss, replace the agent's reply with a concession
    # and cancel their counter-attack — a defeated boss doesn't get a last shot.
    if boss.agent_hp - user_damage <= 0:
        agent_reply = await get_concession_message(
            boss.agent, session.idea, user_content
        )
        agent_damage = 0
        agent_damage_reason = None

    # Update user message with damage dealt to agent
    user_msg.damage = user_damage
    user_msg.damage_reason = user_damage_reason

    # Store agent message with its damage value
    agent_msg = BattleMessage(
        boss_id=boss.id,
        role="agent",
        content=agent_reply,
        damage=agent_damage,
        damage_reason=agent_damage_reason,
    )
    db.add(agent_msg)

    # Apply damage
    boss.agent_hp = max(0, boss.agent_hp - user_damage)
    boss.user_hp = max(0, boss.user_hp - agent_damage)

    # Determine outcome
    battle_over = boss.agent_hp == 0 or boss.user_hp == 0
    winner: Optional[str] = None
    defeat_reason: Optional[str] = None
    if battle_over:
        if boss.agent_hp == 0:
            winner = "user"
            boss.status = "defeated"
        else:
            winner = "agent"
            boss.status = "failed"
            defeat_reason = await get_defeat_reason(
                idea=session.idea,
                user_message=user_content,
                agent_reply=agent_reply,
            )

    db.commit()

    return BattleTurnOut(
        agent_reply=agent_reply,
        user_damage=user_damage,
        user_damage_reason=user_damage_reason,
        agent_damage=agent_damage,
        agent_damage_reason=agent_damage_reason,
        user_hp=boss.user_hp,
        agent_hp=boss.agent_hp,
        battle_over=battle_over,
        winner=winner,
        defeat_reason=defeat_reason,
    )


@router.post("/sessions/{session_id}/battles/{boss_id}/retry")
def retry_battle(
    session_id: int,
    boss_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Reset a failed battle: clears the full transcript and restores HP to 100/100."""
    user_id = principal
    session = (
        db.query(GauntletSession)
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    boss = (
        db.query(BattleBoss)
        .filter(
            BattleBoss.id == boss_id,
            BattleBoss.session_id == session_id,
        )
        .first()
    )
    if not boss:
        raise HTTPException(status_code=404, detail="Battle not found")
    if boss.status != "failed":
        raise HTTPException(
            status_code=400, detail="Only failed battles can be retried"
        )

    # Full reset: wipe transcript so the boss opens fresh
    db.query(BattleMessage).filter(BattleMessage.boss_id == boss_id).delete()
    boss.user_hp = MAX_HP
    boss.agent_hp = MAX_HP
    boss.status = "pending"
    db.commit()
    return {"ok": True}


@router.post(
    "/sessions/{session_id}/battles/{boss_id}/bypass", response_model=BattleTurnOut
)
def bypass_battle(
    session_id: int,
    boss_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Dev shortcut: instantly defeat the current boss (sets agent HP to 0)."""
    user_id = principal
    session = (
        db.query(GauntletSession)
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    boss = (
        db.query(BattleBoss)
        .filter(BattleBoss.id == boss_id, BattleBoss.session_id == session_id)
        .first()
    )
    if not boss:
        raise HTTPException(status_code=404, detail="Battle not found")
    if boss.status == "defeated":
        raise HTTPException(status_code=400, detail="This boss is already defeated")

    user_damage = boss.agent_hp
    boss.agent_hp = 0
    boss.status = "defeated"

    db.commit()

    return BattleTurnOut(
        agent_reply="*stares blankly, then collapses* ...you win this time.",
        user_damage=user_damage,
        user_damage_reason="bypass",
        agent_damage=0,
        agent_damage_reason=None,
        user_hp=boss.user_hp,
        agent_hp=0,
        battle_over=True,
        winner="user",
        defeat_reason=None,
    )


@router.post("/sessions/{session_id}/summary/boss/{boss_id}")
async def boss_summary_endpoint(
    session_id: int,
    boss_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Generate a one-sentence summary for a single defeated boss battle."""
    user_id = principal
    session = (
        db.query(GauntletSession)
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    boss = (
        db.query(BattleBoss)
        .options(joinedload(BattleBoss.agent), joinedload(BattleBoss.messages))
        .filter(BattleBoss.id == boss_id, BattleBoss.session_id == session_id)
        .first()
    )
    if not boss or boss.status != "defeated":
        raise HTTPException(status_code=404, detail="Defeated battle not found")
    name = boss.agent.name if boss.agent else f"Agent #{boss.agent_id}"
    summary = await generate_boss_summary(session, boss)
    return {"name": name, "summary": summary}


@router.post("/sessions/{session_id}/summary/objections")
async def objections_summary_endpoint(
    session_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Generate grouped objections synthesis across all defeated bosses."""
    user_id = principal
    session = (
        db.query(GauntletSession)
        .options(
            selectinload(GauntletSession.bosses).options(
                joinedload(BattleBoss.agent),
                selectinload(BattleBoss.messages),
            )
        )
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    objections = await generate_objections(session, session.bosses)
    return {"objections": objections}


@router.post("/sessions/{session_id}/summary")
async def create_summary(
    session_id: int,
    principal: str = Depends(get_current_principal),
    body: StoreSummaryRequest = StoreSummaryRequest(),
    db: Session = Depends(get_db),
):
    user_id = principal
    session = (
        db.query(GauntletSession)
        .options(
            selectinload(GauntletSession.bosses).options(
                joinedload(BattleBoss.agent),
                selectinload(BattleBoss.messages),
            )
        )
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    defeated = [b for b in session.bosses if b.status == "defeated"]
    if not defeated:
        raise HTTPException(status_code=400, detail="No defeated bosses yet")

    if body.data:
        summary_text = body.data
    else:
        summary_text = await generate_summary(session, session.bosses)

    session.summary = summary_text
    session.status = "complete"
    db.commit()
    return {"summary": summary_text}


@router.post("/sessions/{session_id}/publish", response_model=LeaderboardEntryOut)
async def publish_to_leaderboard(
    session_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Opt-in: publish a completed game to the public leaderboard.

    Shares exactly: the idea, a one-sentence defense summary, the defeated
    bosses, and derived stats (turns/boss, damage/attack). Re-publishing updates
    the existing snapshot. Idempotent per session.
    """
    session = (
        db.query(GauntletSession)
        .options(
            selectinload(GauntletSession.bosses).options(
                joinedload(BattleBoss.agent),
                selectinload(BattleBoss.messages),
            )
        )
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == principal)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "complete":
        raise HTTPException(
            status_code=400, detail="Finish the game before publishing it"
        )

    stats = compute_session_stats(session, session.bosses)
    if stats["bosses_defeated"] == 0:
        raise HTTPException(
            status_code=400, detail="Defeat at least one critic before publishing"
        )

    defense_summary = await generate_defense_summary(session, session.bosses)
    display_name = (
        principal.split("@")[0] if principal else "anonymous"
    ) or "anonymous"

    entry = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.session_id == session_id)
        .first()
    )
    if entry is None:
        entry = LeaderboardEntry(session_id=session_id, principal=principal)
        db.add(entry)

    entry.user_display_name = display_name
    entry.idea = session.idea
    entry.defense_summary = defense_summary
    entry.defeated_bosses = json.dumps(stats["defeated_names"])
    entry.difficulty = session.difficulty or "difficult"
    entry.bosses_defeated = stats["bosses_defeated"]
    entry.total_bosses = stats["total_bosses"]
    entry.avg_turns_per_boss = stats["avg_turns_per_boss"]
    entry.avg_damage_per_attack = stats["avg_damage_per_attack"]
    entry.score = stats["score"]

    db.commit()
    db.refresh(entry)
    return _entry_to_out(entry)


@router.delete("/sessions/{session_id}/publish")
def unpublish_from_leaderboard(
    session_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Remove the player's own session from the leaderboard."""
    entry = (
        db.query(LeaderboardEntry)
        .filter(
            LeaderboardEntry.session_id == session_id,
            LeaderboardEntry.principal == principal,
        )
        .first()
    )
    if entry:
        db.delete(entry)
        db.commit()
    return {"status": "unpublished"}


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    principal: str = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Permanently delete one of the player's own games (bosses/messages cascade).

    Also drops any leaderboard entry for it — a leaderboard row is a snapshot
    that outlives its session, but deleting the game entirely should take the
    public entry with it rather than leaving a dangling reference.
    """
    session = (
        db.query(GauntletSession)
        .filter(GauntletSession.id == session_id, GauntletSession.user_id == principal)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.query(LeaderboardEntry).filter(
        LeaderboardEntry.session_id == session_id
    ).delete()
    db.delete(session)
    db.commit()
    return {"status": "deleted"}
