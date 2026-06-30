from langchain_core.messages import HumanMessage

from app.agents.nodes import semantic as semantic_module


class Response:
    def __init__(self, content: str):
        self.content = content


class StubLLM:
    def __init__(self, content: str | None = None, should_fail: bool = False):
        self._content = content
        self._should_fail = should_fail

    async def ainvoke(self, _messages):
        if self._should_fail:
            raise RuntimeError("llm failure")
        return Response(self._content or "{}")


async def test_semantic_agent_parses_fenced_json(monkeypatch):
    payload = """```json
    {
      "annotations": [{"excerpt": "x", "type": "assumption", "note": "y"}],
      "scratchpad": {
        "consensus": "Agreed on scope.",
        "open_questions": ["What assumptions remain?"],
        "key_ideas": ["Focus on constraints"]
      }
    }
    ```"""

    monkeypatch.setattr(
        semantic_module,
        "_build_model_candidates",
        lambda _p, _m: [("openai", "gpt-4o-mini")],
    )
    monkeypatch.setattr(
        semantic_module,
        "get_llm",
        lambda provider, model_name, temperature=0.2: StubLLM(content=payload),
    )

    result = await semantic_module.run_semantic_agent([HumanMessage(content="hello")])

    assert result["scratchpad"]["consensus"] == "Agreed on scope."
    assert result["scratchpad"]["open_questions"] == ["What assumptions remain?"]
    assert result["scratchpad"]["key_ideas"] == ["Focus on constraints"]


async def test_semantic_agent_falls_back_to_second_candidate(monkeypatch):
    monkeypatch.setattr(
        semantic_module,
        "_build_model_candidates",
        lambda _p, _m: [("openai", "bad-model"), ("ollama", "good-model")],
    )

    def fake_get_llm(provider, model_name, temperature=0.2):
        if model_name == "bad-model":
            return StubLLM(should_fail=True)
        return StubLLM(
            content='{"annotations": [], "scratchpad": {"consensus": "Works", "open_questions": [], "key_ideas": ["Fallback used"]}}'
        )

    monkeypatch.setattr(semantic_module, "get_llm", fake_get_llm)

    result = await semantic_module.run_semantic_agent([HumanMessage(content="hello")])

    assert result["scratchpad"]["consensus"] == "Works"
    assert result["scratchpad"]["key_ideas"] == ["Fallback used"]
