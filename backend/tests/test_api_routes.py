from app.models import schema


def test_health_endpoint(client):
    api_response = client.get("/api/health")

    assert api_response.status_code == 200
    assert api_response.json()["status"] == "ok"


def _create_agent(db_session, name: str = "Analyst", budget: int = 3) -> schema.Agent:
    agent = schema.Agent(
        name=name,
        sort_order=0,
        role_description=f"{name} role",
        relevance_instructions="",
        system_prompt=f"You are {name}.",
        provider="ollama",
        model="llama3",
        token_budget=budget,
    )
    db_session.add(agent)
    db_session.commit()
    db_session.refresh(agent)
    return agent


def _create_room(db_session, name: str = "Arena Room") -> schema.Room:
    room = schema.Room(name=name)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    return room


def test_rooms_crud_and_agent_auto_association(client, db_session):
    agent_a = _create_agent(db_session, name="Analyst")
    agent_b = _create_agent(db_session, name="Critic")

    create_response = client.post("/api/rooms/", json={"name": "Planning Room"})
    assert create_response.status_code == 200
    created_room = create_response.json()
    assert created_room["name"] == "Planning Room"

    room_agents = (
        db_session.query(schema.RoomAgent)
        .filter(schema.RoomAgent.room_id == created_room["id"])
        .all()
    )
    assert {(mapping.agent_id, mapping.is_active) for mapping in room_agents} == {
        (agent_a.id, True),
        (agent_b.id, True),
    }

    list_response = client.get("/api/rooms/")
    assert list_response.status_code == 200
    assert list_response.json()[0]["id"] == created_room["id"]

    rename_response = client.patch(
        f"/api/rooms/{created_room['id']}", json={"name": "Renamed Room"}
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["name"] == "Renamed Room"

    delete_response = client.delete(f"/api/rooms/{created_room['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == f"Room {created_room['id']} deleted"
    assert (
        db_session.query(schema.Room)
        .filter(schema.Room.id == created_room["id"])
        .first()
        is None
    )


def test_room_agent_toggle_and_bulk_active(client, db_session):
    agent_a = _create_agent(db_session, name="Analyst")
    _create_agent(db_session, name="Critic")
    room = _create_room(db_session)

    toggle_response = client.post(f"/api/rooms/{room.id}/agents/{agent_a.id}/toggle")
    assert toggle_response.status_code == 200
    assert toggle_response.json()["is_active"] is True

    agents_response = client.get(f"/api/rooms/{room.id}/agents")
    assert agents_response.status_code == 200
    agents = {agent["name"]: agent for agent in agents_response.json()}
    assert agents["Analyst"]["is_active"] is True
    assert agents["Critic"]["is_active"] is False

    bulk_response = client.post(f"/api/rooms/{room.id}/agents/bulk-active?active=true")
    assert bulk_response.status_code == 200

    refreshed_response = client.get(f"/api/rooms/{room.id}/agents")
    refreshed_agents = {agent["name"]: agent for agent in refreshed_response.json()}
    assert refreshed_agents["Analyst"]["is_active"] is True
    assert refreshed_agents["Critic"]["is_active"] is True
    assert refreshed_agents["Analyst"]["token_budget"] == 3


def test_settings_partial_update_and_readback(client):
    empty_response = client.get("/api/settings/")
    assert empty_response.status_code == 200
    assert empty_response.json() == {}

    update_response = client.post(
        "/api/settings/",
        json={
            "openai_api_key": "test-openai-key",
            "ollama_base_url": "http://localhost:11434",
            "default_agent_turn_budget": 7,
            "global_system_instruction": "Keep it sharp.",
            "non_agent_provider": "ollama",
            "non_agent_model": "llama3",
        },
    )
    assert update_response.status_code == 200

    read_response = client.get("/api/settings/")
    assert read_response.status_code == 200
    payload = read_response.json()
    assert payload["openai_api_key"] is True
    assert payload["anthropic_api_key"] is False
    assert payload["google_api_key"] is False
    assert payload["ollama_base_url"] == "http://localhost:11434"
    assert payload["default_agent_turn_budget"] == 7
    assert payload["global_system_instruction"] == "Keep it sharp."
    assert payload["non_agent_provider"] == "ollama"
    assert payload["non_agent_model"] == "llama3"

    partial_update = client.post(
        "/api/settings/", json={"global_system_instruction": "Updated."}
    )
    assert partial_update.status_code == 200

    updated_payload = client.get("/api/settings/").json()
    assert updated_payload["openai_api_key"] is True
    assert updated_payload["global_system_instruction"] == "Updated."
    assert updated_payload["default_agent_turn_budget"] == 7
    assert updated_payload["non_agent_provider"] == "ollama"
    assert updated_payload["non_agent_model"] == "llama3"


def test_agents_crud_and_duplicate_name_rejection(client, monkeypatch):
    deleted_agent_names: list[str] = []

    async def _fake_delete_agent_memories(agent_name: str):
        deleted_agent_names.append(agent_name)

    monkeypatch.setattr(
        "app.agents.memory.delete_agent_memories", _fake_delete_agent_memories
    )

    create_response = client.post(
        "/api/agents/",
        json={
            "name": "Planner",
            "role_description": "Makes plans.",
            "system_prompt": "Plan carefully.",
            "emoji": "🧭",
            "provider": "ollama",
            "model": "llama3",
            "token_budget": 4,
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["name"] == "Planner"
    assert created["sort_order"] == 1

    duplicate_response = client.post(
        "/api/agents/",
        json={
            "name": "Planner",
            "role_description": "Duplicate.",
            "system_prompt": "Duplicate.",
            "emoji": "🤖",
            "provider": "ollama",
            "model": "llama3",
            "token_budget": 4,
        },
    )
    assert duplicate_response.status_code == 400

    update_response = client.put(
        f"/api/agents/{created['id']}",
        json={
            "name": "Planner Prime",
            "role_description": "Improves plans.",
            "system_prompt": "Improve carefully.",
            "emoji": "🧠",
            "provider": "openai",
            "model": "gpt-4o-mini",
            "token_budget": 6,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Planner Prime"

    list_response = client.get("/api/agents/")
    assert list_response.status_code == 200
    assert [agent["name"] for agent in list_response.json()] == ["Planner Prime"]

    delete_response = client.delete(f"/api/agents/{created['id']}")
    assert delete_response.status_code == 200
    assert client.get("/api/agents/").json() == []
    assert deleted_agent_names == ["Planner Prime"]


def test_agents_reorder_updates_management_and_room_roster_order(client, db_session):
    first_agent = _create_agent(db_session, name="Analyst")
    second_agent = _create_agent(db_session, name="Critic")
    first_agent.sort_order = 1
    second_agent.sort_order = 2
    db_session.commit()

    reorder_response = client.post(
        "/api/agents/reorder", json={"agent_ids": [second_agent.id, first_agent.id]}
    )
    assert reorder_response.status_code == 200
    assert [agent["name"] for agent in reorder_response.json()] == ["Critic", "Analyst"]

    list_response = client.get("/api/agents/")
    assert list_response.status_code == 200
    assert [agent["name"] for agent in list_response.json()] == ["Critic", "Analyst"]

    room = _create_room(db_session)
    room_agents_response = client.get(f"/api/rooms/{room.id}/agents")
    assert room_agents_response.status_code == 200
    assert [agent["name"] for agent in room_agents_response.json()] == [
        "Critic",
        "Analyst",
    ]


def test_messages_list_and_export(client, db_session):
    agent = _create_agent(db_session, name="Analyst")
    room = _create_room(db_session, name="Export Room")

    db_session.add_all(
        [
            schema.Message(room_id=room.id, role="human", content="What do you think?"),
            schema.Message(
                room_id=room.id,
                role="agent",
                content="I think it works.",
                agent_id=agent.id,
                is_interrupted=True,
            ),
        ]
    )
    db_session.commit()

    list_response = client.get(f"/api/rooms/{room.id}/messages/")
    assert list_response.status_code == 200
    messages = list_response.json()
    assert [message["role"] for message in messages] == ["human", "agent"]
    assert messages[1]["agent"]["name"] == "Analyst"

    export_response = client.get(f"/api/rooms/{room.id}/messages/export")
    assert export_response.status_code == 200
    markdown = export_response.text
    assert "# Export Room" in markdown
    assert "**" in markdown
    assert "I think it works." in markdown
    assert "*(interrupted)*" in markdown


def test_messages_list_returns_most_recent_window(client, db_session):
    room = _create_room(db_session, name="Window Room")

    for idx in range(1, 6):
        db_session.add(
            schema.Message(room_id=room.id, role="human", content=f"msg-{idx}")
        )
    db_session.commit()

    list_response = client.get(f"/api/rooms/{room.id}/messages/?limit=3")
    assert list_response.status_code == 200
    messages = list_response.json()
    assert [message["content"] for message in messages] == ["msg-3", "msg-4", "msg-5"]


def test_control_routes_toggle_room_flags(client):
    stop_response = client.post("/api/rooms/5/emergency-stop")
    assert stop_response.status_code == 200
    assert stop_response.json() == {
        "status": "stopped",
        "room_id": 5,
        "cancelled": False,
    }

    resume_response = client.post("/api/rooms/5/resume")
    assert resume_response.status_code == 200
    assert resume_response.json() == {"status": "resumed", "room_id": 5}


def test_control_routes_persist_room_control_state(client, db_session):
    room = _create_room(db_session, name="Control Room")

    stop_response = client.post(f"/api/rooms/{room.id}/emergency-stop")
    assert stop_response.status_code == 200

    state = (
        db_session.query(schema.RoomControlState)
        .filter(schema.RoomControlState.room_id == room.id)
        .first()
    )
    assert state is not None
    assert state.emergency_stop is True

    resume_response = client.post(f"/api/rooms/{room.id}/resume")
    assert resume_response.status_code == 200

    db_session.refresh(state)
    assert state.emergency_stop is False


def test_avatar_routes_return_svg_without_external_services(client):
    preset_response = client.get("/api/avatars/preset/scholar")
    assert preset_response.status_code == 200
    assert preset_response.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in preset_response.text

    generated_response = client.get(
        "/api/avatars/generate-default",
        params={"role_description": "Analyzes edge cases", "agent_name": "Analyst"},
    )
    assert generated_response.status_code == 200
    assert generated_response.headers["content-type"].startswith("image/svg+xml")
    assert "Analyst"[0] in generated_response.text
