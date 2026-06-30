from app.core.utils import sanitize_agent_content


def test_sanitize_agent_content_truncates_transcript_artifacts():
    raw = (
        "AI amplifies human potential.\n"
        "### User: But if AI is so advanced, why can't it solve climate change?\n\n"
        "Assistant:\n\n"
        "It can help, but human institutions still matter.\n"
        "### Devil's Advocate: If AI solved everything, would purpose erode?"
    )

    cleaned = sanitize_agent_content(raw, "Ethos Architect")

    assert cleaned == "AI amplifies human potential."


def test_sanitize_agent_content_strips_assistant_label():
    raw = "Assistant: Human agency remains essential."

    cleaned = sanitize_agent_content(raw, "Ethos Architect")

    assert cleaned == "Human agency remains essential."
