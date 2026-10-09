import base64
import hashlib
import hmac
import secrets
from datetime import timedelta

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.utils import timezone


OTP_TTL = timedelta(minutes=1)
OTP_MAX_ATTEMPTS = 2


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str, salt: bytes) -> str:
    return hashlib.scrypt(otp.encode("ascii"), salt=salt, n=2**14, r=8, p=1).hex()


def verify_otp(otp: str, expected_hash: str, salt: bytes) -> bool:
    return hmac.compare_digest(hash_otp(otp, salt), expected_hash)


def _otp_fernet():
    configured_key = getattr(settings, "OTP_ENCRYPTION_KEY", "")
    # SECURITY-PLACEHOLDER: local OTP envelope encryption derives from a development secret; production must use a KMS/HSM-backed envelope key. See TODO_SECURITY_DEBT.md
    secret = configured_key or getattr(settings, "DEV_SIGNING_SECRET", "") or settings.SECRET_KEY
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_otp(otp: str) -> str:
    return _otp_fernet().encrypt(otp.encode("ascii")).decode("ascii")


def decrypt_otp(ciphertext: str) -> str:
    try:
        return _otp_fernet().decrypt(ciphertext.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError) as exc:
        raise ValueError("OTP envelope could not be decrypted") from exc


def expiry_from_now():
    return timezone.now() + OTP_TTL
