"""
Public leaderboard.

Lists opt-in published game snapshots, newest first. Entries are created via
POST /api/gauntlet/sessions/{id}/publish (see gauntlet.py). This is a gameplay
feature available in self-host too; the hosted deployment simply has more
players.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..models.db import get_db
from ..models.schema import LeaderboardEntry
from .gauntlet import LeaderboardEntryOut, _entry_to_out

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])


@router.get("", response_model=List[LeaderboardEntryOut])
def list_leaderboard(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    entries = (
        db.query(LeaderboardEntry)
        .order_by(LeaderboardEntry.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_entry_to_out(e) for e in entries]
