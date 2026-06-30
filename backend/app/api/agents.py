"""
Global Agent CRUD endpoints.
Supports create/list/update/delete for agent blueprints across all rooms.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from ..models import schema
from ..schemas.pydantic_models import AgentCreate, AgentResponse, AgentReorderRequest
from ..models.db import get_db
from ..core.llm import invalidate_settings_cache

from ..services.prompt_loader import prompt_loader

router = APIRouter(prefix="/api/agents", tags=["Agents"])


@router.get("/presets", response_model=List[dict])
def list_presets():
    return prompt_loader.list_prompts()


@router.get("/", response_model=List[AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    return (
        db.query(schema.Agent)
        .order_by(schema.Agent.sort_order.asc(), schema.Agent.id.asc())
        .all()
    )


@router.post("/", response_model=AgentResponse)
def create_agent(agent_in: AgentCreate, db: Session = Depends(get_db)):
    # Check if name already exists
    existing = db.query(schema.Agent).filter(schema.Agent.name == agent_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agent name already exists")

    payload = agent_in.model_dump()
    if payload.get("sort_order") is None:
        max_sort_order = db.query(func.max(schema.Agent.sort_order)).scalar()
        payload["sort_order"] = (max_sort_order or 0) + 1

    agent = schema.Agent(**payload)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    invalidate_settings_cache()
    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
def update_agent(agent_id: int, agent_in: AgentCreate, db: Session = Depends(get_db)):
    agent = db.query(schema.Agent).filter(schema.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Check name collision
    existing = (
        db.query(schema.Agent)
        .filter(schema.Agent.name == agent_in.name, schema.Agent.id != agent_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Agent name already exists")

    for key, val in agent_in.model_dump().items():
        if key == "sort_order" and val is None:
            continue
        setattr(agent, key, val)
    db.commit()
    db.refresh(agent)
    invalidate_settings_cache()
    return agent


@router.post("/reorder", response_model=List[AgentResponse])
def reorder_agents(reorder_in: AgentReorderRequest, db: Session = Depends(get_db)):
    agents = (
        db.query(schema.Agent)
        .order_by(schema.Agent.sort_order.asc(), schema.Agent.id.asc())
        .all()
    )
    existing_ids = [agent.id for agent in agents]

    if sorted(existing_ids) != sorted(reorder_in.agent_ids):
        raise HTTPException(
            status_code=400,
            detail="Reorder request must include every agent exactly once",
        )

    agents_by_id = {agent.id: agent for agent in agents}
    for index, agent_id in enumerate(reorder_in.agent_ids, start=1):
        agents_by_id[agent_id].sort_order = index

    db.commit()
    invalidate_settings_cache()
    return (
        db.query(schema.Agent)
        .order_by(schema.Agent.sort_order.asc(), schema.Agent.id.asc())
        .all()
    )


@router.delete("/{agent_id}")
async def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(schema.Agent).filter(schema.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()
    invalidate_settings_cache()
    return {"message": f"Agent {agent_id} deleted"}
