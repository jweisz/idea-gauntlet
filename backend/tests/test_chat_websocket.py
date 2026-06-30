from collections.abc import AsyncIterator

from app.models import schema


def _collect_events_until(
    websocket, stop_type: str, max_events: int = 24
) -> list[dict]:
    events: list[dict] = []
    for _ in range(max_events):
        event = websocket.receive_json()
        events.append(event)
        if event.get("type") == stop_type:
            break
    return events


def _seed_room_with_agent(db_session):
    settings = schema.GlobalSettings(
        default_agent_turn_budget=3, global_system_instruction="Be precise."
    )
    agent = schema.Agent(
        name="Analyst",
        role_description="Finds the core issue.",
        system_prompt="Respond precisely.",
        provider="ollama",
        model="llama3",
        token_budget=3,
    )
    room = schema.Room(name="Socket Room")
    db_session.add_all([settings, agent, room])
    db_session.commit()
    db_session.refresh(agent)
    db_session.refresh(room)

    db_session.add(schema.RoomAgent(room_id=room.id, agent_id=agent.id, is_active=True))
    db_session.commit()
    return room, agent


def test_chat_websocket_streams_token_telemetry_and_semantic_events(
    client, db_session, monkeypatch
):
    room, agent = _seed_room_with_agent(db_session)

    class StubGraph:
        async def astream_events(
            self, initial_state, version: str
        ) -> AsyncIterator[dict]:
            assert version == "v2"
            assert initial_state["messages"][0].content == "hello arena"

            yield {
                "event": "on_node_start",
                "name": "router",
            }
            yield {
                "event": "on_node_end",
                "name": "router",
                "data": {
                    "output": {
                        "agent_statuses": {agent.name: "Thinking"},
                        "agent_scores": {agent.name: 9.0},
                        "agent_reasons": {agent.name: "Best match."},
                    }
                },
            }
            yield {
                "event": "on_chat_model_stream",
                "name": "agent_node",
                "metadata": {"agent_name": agent.name},
                "data": {"chunk": type("Chunk", (), {"content": "Hello world"})()},
            }
            yield {
                "event": "on_node_end",
                "name": f"agent_node_{agent.name}",
                "data": {
                    "output": {
                        "agent_budgets": {agent.name: 2},
                        "telemetry": [
                            {
                                "agent_name": agent.name,
                                "tokens_used": 5,
                                "latency_ms": 12.5,
                                "turn": 1,
                            }
                        ],
                    }
                },
            }

    async def fake_semantic(messages):
        assert [message.content for message in messages] == [
            "hello arena",
            "Hello world",
        ]
        return {
            "annotations": [{"kind": "fact-check", "value": "clear"}],
            "scratchpad": {
                "consensus": "Aligned",
                "open_questions": [],
                "key_ideas": ["Hello world"],
            },
        }

    monkeypatch.setattr("app.api.chat.graph", StubGraph())
    monkeypatch.setattr(
        "app.services.chat_runtime.semantic_pipeline.run_semantic_agent", fake_semantic
    )

    with client.websocket_connect(f"/api/chat/{room.id}/stream") as websocket:
        first_event = websocket.receive_json()
        assert first_event == {"type": "activity_stats", "stats": {}}

        second_event = websocket.receive_json()
        assert second_event["type"] == "inference_status"
        assert any(
            process["process_id"] == "router" for process in second_event["processes"]
        )

        websocket.send_text('{"text":"hello arena","mentions":[]}')

        received = _collect_events_until(websocket, "semantic")

    event_types = [event["type"] for event in received]
    assert "status_update" in event_types
    assert "token" in event_types
    assert "agent_message_done" in event_types
    assert "telemetry" in event_types
    assert "activity_stats" in event_types
    assert "done" in event_types
    assert "semantic" in event_types
    assert "inference_status" in event_types

    telemetry_event = next(event for event in received if event["type"] == "telemetry")
    assert telemetry_event["budgets"] == {agent.name: 2}
    assert telemetry_event["data"][0]["agent_name"] == agent.name

    semantic_event = next(event for event in received if event["type"] == "semantic")
    assert semantic_event["scratchpad"]["key_ideas"] == ["Hello world"]

    stored_messages = (
        db_session.query(schema.Message)
        .filter(schema.Message.room_id == room.id)
        .order_by(schema.Message.id.asc())
        .all()
    )
    assert [message.role for message in stored_messages] == ["human", "agent"]
    assert stored_messages[0].content == "hello arena"
    assert stored_messages[1].content == "Hello world"


def test_chat_websocket_emits_agent_message_done_for_repeated_agent_turns(
    client, db_session, monkeypatch
):
    room, agent = _seed_room_with_agent(db_session)

    class StubGraph:
        async def astream_events(
            self, initial_state, version: str
        ) -> AsyncIterator[dict]:
            assert version == "v2"

            yield {
                "event": "on_chat_model_stream",
                "name": "agent_node",
                "metadata": {"agent_name": agent.name},
                "data": {"chunk": type("Chunk", (), {"content": "First reply"})()},
            }
            yield {
                "event": "on_node_end",
                "name": f"agent_node_{agent.name}",
                "data": {
                    "output": {
                        "agent_budgets": {agent.name: 2},
                        "telemetry": [
                            {
                                "agent_name": agent.name,
                                "tokens_used": 5,
                                "latency_ms": 12.5,
                                "turn": 1,
                            }
                        ],
                    }
                },
            }
            yield {
                "event": "on_chat_model_stream",
                "name": "agent_node",
                "metadata": {"agent_name": agent.name},
                "data": {"chunk": type("Chunk", (), {"content": "Second reply"})()},
            }
            yield {
                "event": "on_node_end",
                "name": f"agent_node_{agent.name}",
                "data": {
                    "output": {
                        "agent_budgets": {agent.name: 1},
                        "telemetry": [
                            {
                                "agent_name": agent.name,
                                "tokens_used": 6,
                                "latency_ms": 14.0,
                                "turn": 2,
                            }
                        ],
                    }
                },
            }

    async def fake_semantic(_messages):
        return {
            "annotations": [],
            "scratchpad": {"consensus": "", "open_questions": [], "key_ideas": []},
        }

    monkeypatch.setattr("app.api.chat.graph", StubGraph())
    monkeypatch.setattr(
        "app.services.chat_runtime.semantic_pipeline.run_semantic_agent", fake_semantic
    )

    with client.websocket_connect(f"/api/chat/{room.id}/stream") as websocket:
        assert websocket.receive_json() == {"type": "activity_stats", "stats": {}}
        assert websocket.receive_json()["type"] == "inference_status"
        websocket.send_text('{"text":"hello arena","mentions":[]}')
        received = _collect_events_until(websocket, "done")

    done_events = [event for event in received if event["type"] == "agent_message_done"]
    assert [event["agent"] for event in done_events] == [agent.name, agent.name]
    assert [event.get("content") for event in done_events] == [
        "First reply",
        "Second reply",
    ]

    stored_messages = (
        db_session.query(schema.Message)
        .filter(schema.Message.room_id == room.id)
        .order_by(schema.Message.id.asc())
        .all()
    )
    assert [
        message.content for message in stored_messages if message.role == "agent"
    ] == ["First reply", "Second reply"]


def test_chat_websocket_ignores_blank_messages(client, db_session, monkeypatch):
    room, _ = _seed_room_with_agent(db_session)

    class FailingGraph:
        async def astream_events(self, initial_state, version: str):
            raise AssertionError("Graph should not be invoked for blank messages")

    monkeypatch.setattr("app.api.chat.graph", FailingGraph())

    with client.websocket_connect(f"/api/chat/{room.id}/stream") as websocket:
        first_event = websocket.receive_json()
        assert first_event == {"type": "activity_stats", "stats": {}}

        websocket.send_text('{"text":"   ","mentions":[]}')

    assert (
        db_session.query(schema.Message)
        .filter(schema.Message.room_id == room.id)
        .count()
        == 0
    )


def test_chat_websocket_ignores_internal_router_stream_chunks(
    client, db_session, monkeypatch
):
    room, agent = _seed_room_with_agent(db_session)

    class StubGraph:
        async def astream_events(
            self, initial_state, version: str
        ) -> AsyncIterator[dict]:
            assert version == "v2"

            # Internal model stream with no agent_name metadata should be hidden.
            yield {
                "event": "on_chat_model_stream",
                "name": "router",
                "metadata": {"langgraph_node": "router"},
                "data": {
                    "chunk": type(
                        "Chunk", (), {"content": '{"scores": {"Analyst": 9}}'}
                    )()
                },
            }
            yield {
                "event": "on_chat_model_stream",
                "name": "agent_node",
                "metadata": {"agent_name": agent.name},
                "data": {"chunk": type("Chunk", (), {"content": "Visible output"})()},
            }
            yield {
                "event": "on_node_end",
                "name": f"agent_node_{agent.name}",
                "data": {
                    "output": {
                        "agent_budgets": {agent.name: 2},
                        "telemetry": [
                            {
                                "agent_name": agent.name,
                                "tokens_used": 3,
                                "latency_ms": 10.0,
                                "turn": 1,
                            }
                        ],
                    }
                },
            }

    async def fake_semantic(_messages):
        return {
            "annotations": [],
            "scratchpad": {"consensus": "", "open_questions": [], "key_ideas": []},
        }

    monkeypatch.setattr("app.api.chat.graph", StubGraph())
    monkeypatch.setattr(
        "app.services.chat_runtime.semantic_pipeline.run_semantic_agent", fake_semantic
    )

    with client.websocket_connect(f"/api/chat/{room.id}/stream") as websocket:
        assert websocket.receive_json() == {"type": "activity_stats", "stats": {}}
        assert websocket.receive_json()["type"] == "inference_status"
        websocket.send_text('{"text":"hello arena","mentions":[]}')
        received = _collect_events_until(websocket, "done")

    token_events = [event for event in received if event["type"] == "token"]
    assert len(token_events) == 1
    assert token_events[0]["agent"] == agent.name
    assert token_events[0]["token"] == "Visible output"
