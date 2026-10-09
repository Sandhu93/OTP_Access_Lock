"""Canonical local-demo unlock-grant encoding.

The grant format is deliberately small and deterministic so the ESP32 can verify the exact
bytes that Django signed without carrying a JSON canonicalization library. This module is part
of the local demonstration profile only; production signing remains a KMS/HSM boundary.
"""

import base64
import json


def canonical_claims(claims: dict) -> bytes:
    """Return the exact UTF-8 bytes covered by the signature."""
    return json.dumps(claims, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def encode_signature(signature: bytes) -> str:
    return base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")


def build_signed_envelope(claims: dict, signature: bytes) -> bytes:
    envelope = {
        "grant": claims,
        "signature": encode_signature(signature),
        "algorithm": "ES256",
    }
    return json.dumps(envelope, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
