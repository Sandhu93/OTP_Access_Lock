import base64
import hashlib
import sys
import types
from unittest.mock import Mock, patch

import pytest
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from django.test import override_settings

from core.providers import KmsSigner, ProviderNotConfigured


def mock_google_auth_modules(session):
    google_module = types.ModuleType("google")
    google_module.__path__ = []
    auth_module = types.ModuleType("google.auth")
    auth_module.default = Mock(return_value=(object(), "test-project"))
    transport_module = types.ModuleType("google.auth.transport")
    transport_module.__path__ = []
    requests_module = types.ModuleType("google.auth.transport.requests")
    requests_module.AuthorizedSession = Mock(return_value=session)
    return {
        "google": google_module,
        "google.auth": auth_module,
        "google.auth.transport": transport_module,
        "google.auth.transport.requests": requests_module,
    }, requests_module


@override_settings(
    KMS_KEY_ID="projects/test-project/locations/asia-south1/keyRings/access-lock/cryptoKeys/unlock-grant/cryptoKeyVersions/1",
    UNLOCK_SIGNING_KEY_ID="unlock-kms-v1",
)
def test_kms_signer_hashes_canonical_claims_and_returns_raw_es256_signature():
    claims = b'{"grant_id":"test-grant"}'
    der_signature = encode_dss_signature(1, 2)
    response = Mock()
    response.json.return_value = {"signature": base64.b64encode(der_signature).decode("ascii")}
    session = Mock()
    session.post.return_value = response

    modules, requests_module = mock_google_auth_modules(session)
    with patch.dict(sys.modules, modules):
        signed = KmsSigner().sign_unlock_grant(claims)

    assert signed.key_id == "unlock-kms-v1"
    assert signed.signature == (1).to_bytes(32, "big") + (2).to_bytes(32, "big")
    args, kwargs = session.post.call_args
    assert args[0].endswith(":asymmetricSign")
    assert kwargs["json"]["digest"]["sha256"] == base64.b64encode(hashlib.sha256(claims).digest()).decode("ascii")
    assert kwargs["timeout"] == 10
    response.raise_for_status.assert_called_once_with()
    requests_module.AuthorizedSession.assert_called_once()
    modules["google.auth"].default.assert_called_once_with(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )


@override_settings(KMS_KEY_ID="", UNLOCK_SIGNING_KEY_ID="unlock-kms-v1")
def test_kms_signer_fails_closed_when_key_is_missing():
    with pytest.raises(ProviderNotConfigured, match="Cloud KMS unlock-grant signing is not configured"):
        KmsSigner().sign_unlock_grant(b"claims")


@override_settings(
    KMS_KEY_ID="projects/test-project/locations/asia-south1/keyRings/access-lock/cryptoKeys/unlock-grant/cryptoKeyVersions/1",
    UNLOCK_SIGNING_KEY_ID="unlock-kms-v1",
)
def test_kms_signer_hides_provider_response_details():
    response = Mock()
    response.raise_for_status.side_effect = RuntimeError("sensitive provider response")
    session = Mock()
    session.post.return_value = response

    modules, _requests_module = mock_google_auth_modules(session)
    with patch.dict(sys.modules, modules), pytest.raises(
        ProviderNotConfigured, match="Cloud KMS could not sign the unlock grant"
    ) as error:
        KmsSigner().sign_unlock_grant(b"claims")

    assert "sensitive provider response" not in str(error.value)
