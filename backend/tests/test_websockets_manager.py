import pytest

from app.core.websockets import ConnectionManager


class _FailingSocket:
    async def send_json(self, _data):
        raise RuntimeError("socket closed")

    async def send_text(self, _data):
        raise RuntimeError("socket closed")


class _HealthySocket:
    def __init__(self):
        self.json_payloads = []
        self.text_payloads = []

    async def send_json(self, data):
        self.json_payloads.append(data)

    async def send_text(self, data):
        self.text_payloads.append(data)


@pytest.mark.asyncio
async def test_send_json_to_room_skips_stale_connections():
    manager = ConnectionManager()
    room_id = 1
    healthy = _HealthySocket()
    failing = _FailingSocket()
    manager.active_connections[room_id] = [failing, healthy]

    await manager.send_json_to_room({"type": "ping"}, room_id)

    assert healthy.json_payloads == [{"type": "ping"}]
    assert manager.active_connections[room_id] == [healthy]


@pytest.mark.asyncio
async def test_broadcast_to_room_skips_stale_connections():
    manager = ConnectionManager()
    room_id = 2
    healthy = _HealthySocket()
    failing = _FailingSocket()
    manager.active_connections[room_id] = [healthy, failing]

    await manager.broadcast_to_room("hello", room_id)

    assert healthy.text_payloads == ["hello"]
    assert manager.active_connections[room_id] == [healthy]
