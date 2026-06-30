from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class UserBase(BaseModel):
    email: str
    name: Optional[str] = None


class UserResponse(UserBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RoomCreate(BaseModel):
    name: str


class RoomUpdate(BaseModel):
    name: str


class RoomResponse(RoomCreate):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AgentBase(BaseModel):
    name: str
    sort_order: Optional[int] = None
    role_description: str
    relevance_instructions: str = ""
    system_prompt: str
    avatar_url: Optional[str] = None
    emoji: str = "🤖"
    token_budget: Optional[int] = 3
    provider: str = "ollama"
    model: str = "llama3"


class AgentCreate(AgentBase):
    pass


class AgentResponse(AgentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class AgentReorderRequest(BaseModel):
    agent_ids: List[int]


class RoomAgentResponse(AgentResponse):
    """Returned when fetching agents for a specific room."""

    is_active: bool


class MessageBase(BaseModel):
    role: str
    content: str
    agent_id: Optional[int] = None
    tokens_used: int = 0
    latency_ms: float = 0.0
    is_interrupted: bool = False


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    id: int
    room_id: int
    timestamp: datetime
    agent: Optional[AgentResponse] = None
    model_config = ConfigDict(from_attributes=True)
