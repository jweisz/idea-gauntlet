from app.services.gauntlet import _detect_copied_from_boss

BOSS_MESSAGE = (
    "Your argument ignores the fact that correlation between remote work and "
    "productivity has never been established by any controlled study."
)


def test_exact_copy_is_detected():
    reason = _detect_copied_from_boss(BOSS_MESSAGE, [BOSS_MESSAGE])
    assert reason is not None


def test_case_and_whitespace_variants_are_detected():
    variant = "  YOUR ARGUMENT   ignores the fact that correlation   between remote work and productivity has never been established by any controlled study.  "
    reason = _detect_copied_from_boss(variant, [BOSS_MESSAGE])
    assert reason is not None


def test_near_duplicate_paraphrase_is_detected():
    paraphrase = (
        "Your argument ignores the fact that correlation between remote work and "
        "productivity has never been established by any rigorous study."
    )
    reason = _detect_copied_from_boss(paraphrase, [BOSS_MESSAGE])
    assert reason is not None


def test_partial_lift_of_a_longer_boss_message_is_detected():
    longer_boss_message = (
        BOSS_MESSAGE
        + " Furthermore, the studies you might cite all suffer from severe "
        "selection bias since remote work is voluntary at most companies."
    )
    lifted_chunk = (
        "correlation between remote work and productivity has never been "
        "established by any controlled study."
    )
    reason = _detect_copied_from_boss(lifted_chunk, [longer_boss_message])
    assert reason is not None


def test_genuine_original_argument_is_not_flagged():
    original = (
        "A 2019 Stanford study of 16,000 workers found a 13% productivity gain "
        "from remote work, directly contradicting that claim."
    )
    reason = _detect_copied_from_boss(original, [BOSS_MESSAGE])
    assert reason is None


def test_short_messages_are_never_flagged():
    reason = _detect_copied_from_boss("no it doesn't", [BOSS_MESSAGE])
    assert reason is None


def test_no_prior_agent_messages_is_not_flagged():
    reason = _detect_copied_from_boss(BOSS_MESSAGE, [])
    assert reason is None
