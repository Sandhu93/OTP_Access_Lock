from core.workflow import InvalidTransition, PENDING_REVIEW, REJECTED, TOKEN_ISSUED, validate_transition


def test_review_rejection_is_allowed():
    assert validate_transition(PENDING_REVIEW, REJECTED).new_status == REJECTED


def test_terminal_state_cannot_be_reopened():
    try:
        validate_transition(TOKEN_ISSUED, PENDING_REVIEW)
    except InvalidTransition:
        pass
    else:
        raise AssertionError("terminal workflow regression was accepted")
