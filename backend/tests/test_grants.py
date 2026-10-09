import json
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from django.test import TestCase, override_settings
from django.utils import timezone

from core.models import EnrolledUser, Locker, PresenceSession, Site, Tenant, UnlockRequest
from core.providers import DevelopmentSigner, SignedGrant
from core.services import maybe_issue_unlock_grant


class DevelopmentGrantTests(TestCase):
    def test_development_signer_uses_p256_signature(self):
        private_key = ec.generate_private_key(ec.SECP256R1())
        pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        with tempfile.TemporaryDirectory() as directory:
            key_path = Path(directory) / "dev-private.pem"
            key_path.write_bytes(pem)
            with override_settings(DEV_MODE=True, DEV_SIGNING_PRIVATE_KEY_PATH=str(key_path), DEV_SIGNING_KEY_ID="local-demo"):
                signed = DevelopmentSigner().sign_unlock_grant(b"grant-claims")
        coordinate_size = (private_key.curve.key_size + 7) // 8
        r_value = int.from_bytes(signed.signature[:coordinate_size], "big")
        s_value = int.from_bytes(signed.signature[coordinate_size:], "big")
        private_key.public_key().verify(
            encode_dss_signature(r_value, s_value), b"grant-claims", ec.ECDSA(hashes.SHA256())
        )
        assert len(signed.signature) == 64
        assert signed.key_id == "local-demo"

    def test_grant_requires_both_fresh_ble_sessions_and_publishes_claims(self):
        tenant = Tenant.objects.create(name="Bank", slug="grant-bank")
        site = Site.objects.create(tenant=tenant, name="HQ")
        locker = Locker.objects.create(tenant=tenant, site=site, name="Vault", hardware_id="grant-lock")
        requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="GA", status="active")
        second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Person B", employee_id="GB", status="active")
        request = UnlockRequest.objects.create(
            tenant=tenant,
            locker=locker,
            requester=requester,
            second_party=second_party,
            reason="grant test",
            status="presence_verifying",
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        PresenceSession.objects.create(
            request=request, user=requester, locker=locker, ble_session_id="0011223344556677",
            authenticated_at=timezone.now(), last_heartbeat_at=timezone.now(),
        )
        PresenceSession.objects.create(
            request=request, user=second_party, locker=locker, ble_session_id="8899aabbccddeeff",
            authenticated_at=timezone.now(), last_heartbeat_at=timezone.now(),
        )
        signer = Mock()
        signer.sign_unlock_grant.return_value = SignedGrant("local-demo", b"signature")
        gateway = Mock()
        with patch("core.services.get_signer", return_value=signer), patch("core.services.get_device_gateway", return_value=gateway):
            grant = maybe_issue_unlock_grant(request.id)

        request.refresh_from_db()
        assert request.status == "token_issued"
        assert grant.key_id == "local-demo"
        published_payload = gateway.publish_signed_grant.call_args.args[3]
        envelope = json.loads(published_payload)
        assert envelope["grant"]["required_presence_ids"] == ["0011223344556677", "8899aabbccddeeff"]
        assert envelope["algorithm"] == "ES256"
