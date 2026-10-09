from dataclasses import dataclass


class InvalidTransition(ValueError):
    pass


PENDING_REVIEW = "pending_review"
APPROVED_WAITING = "approved_waiting_second_party"
PRESENCE_VERIFYING = "presence_verifying"
TOKEN_ISSUED = "token_issued"
ACTUATED = "actuated"
REJECTED = "rejected"
OTP_LOCKED_OUT = "otp_locked_out"
EXPIRED = "expired"
ABORTED = "aborted"

ALLOWED_TRANSITIONS = {
    PENDING_REVIEW: {APPROVED_WAITING, REJECTED, EXPIRED},
    APPROVED_WAITING: {PRESENCE_VERIFYING, OTP_LOCKED_OUT, EXPIRED, ABORTED},
    PRESENCE_VERIFYING: {TOKEN_ISSUED, ABORTED, EXPIRED},
    TOKEN_ISSUED: {ACTUATED, EXPIRED, ABORTED},
    ACTUATED: set(), REJECTED: set(), OTP_LOCKED_OUT: set(), EXPIRED: set(), ABORTED: set(),
}


@dataclass(frozen=True)
class Transition:
    old_status: str
    new_status: str


def validate_transition(old_status: str, new_status: str) -> Transition:
    if new_status not in ALLOWED_TRANSITIONS.get(old_status, set()):
        raise InvalidTransition(f"cannot transition {old_status!r} -> {new_status!r}")
    return Transition(old_status, new_status)
