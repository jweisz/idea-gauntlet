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
        token_budget=budget,
    )
    db_session.add(agent)
    db_session.commit()
    db_session.refresh(agent)
    return agent


def test_settings_partial_update_and_readback(client):
    empty_response = client.get("/api/settings/")
    assert empty_response.status_code == 200

    update_response = client.post(
        "/api/settings/",
        json={
            "non_agent_provider": "openai",
            "non_agent_model": "gpt-4o-mini",
        },
    )
    assert update_response.status_code == 200

    read_response = client.get("/api/settings/")
    assert read_response.status_code == 200
    payload = read_response.json()
    assert payload["non_agent_provider"] == "openai"
    assert payload["non_agent_model"] == "gpt-4o-mini"

    partial_update = client.post(
        "/api/settings/",
        json={"non_agent_provider": "ollama", "non_agent_model": "llama3"},
    )
    assert partial_update.status_code == 200

    updated_payload = client.get("/api/settings/").json()
    assert updated_payload["non_agent_provider"] == "ollama"
    assert updated_payload["non_agent_model"] == "llama3"


def test_agents_crud_and_duplicate_name_rejection(client):
    create_response = client.post(
        "/api/agents/",
        json={
            "name": "Planner",
            "role_description": "Makes plans.",
            "system_prompt": "Plan carefully.",
            "emoji": "🧭",
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


def test_agents_reorder_updates_management_order(client, db_session):
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
