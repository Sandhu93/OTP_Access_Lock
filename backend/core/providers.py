"""External provider adapters.

Provider classes fail closed when their required configuration is absent. The development
adapters are deliberately explicit and are never selected unless development opts into them.
"""

import base64
import hashlib
import json
import secrets
import ssl
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime

import jwt
import paho.mqtt.client as mqtt
from django.conf import settings
from django.utils import timezone


class ProviderNotConfigured(RuntimeError):
    pass


class OidcProvider:
    """OIDC authorization-code + PKCE adapter for the admin browser session."""

    def _discovery_url(self):
        return settings.OIDC_DISCOVERY_URL or f"{settings.OIDC_ISSUER_URL.rstrip('/')}/.well-known/openid-configuration"

    def _get_json(self, url):
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                return json.load(response)
        except Exception as exc:
            raise ProviderNotConfigured(f"OIDC discovery is unavailable: {exc}") from exc

    def discovery(self):
        if not settings.OIDC_ISSUER_URL or not settings.OIDC_CLIENT_ID:
            raise ProviderNotConfigured("OIDC issuer and client ID are not configured")
        return self._get_json(self._discovery_url())

    def begin_login(self, request):
        discovery = self.discovery()
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        request.session["oidc_state"] = state
        request.session["oidc_nonce"] = nonce
        request.session["oidc_verifier"] = verifier
        params = {
            "client_id": settings.OIDC_CLIENT_ID,
            "response_type": "code",
            "scope": "openid profile email",
            "redirect_uri": settings.OIDC_REDIRECT_URI,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        authorization_endpoint = settings.OIDC_PUBLIC_AUTHORIZATION_ENDPOINT or discovery["authorization_endpoint"]
        return f"{authorization_endpoint}?{urllib.parse.urlencode(params)}"

    def authenticate_callback(self, request, authorization_code: str, state: str):
        if not secrets.compare_digest(str(request.session.pop("oidc_state", "")), str(state)):
            raise ProviderNotConfigured("OIDC state validation failed")
        nonce = request.session.pop("oidc_nonce", "")
        verifier = request.session.pop("oidc_verifier", "")
        discovery = self.discovery()
        body = urllib.parse.urlencode({
            "grant_type": "authorization_code",
            "client_id": settings.OIDC_CLIENT_ID,
            "code": authorization_code,
            "redirect_uri": settings.OIDC_REDIRECT_URI,
            "code_verifier": verifier,
        }).encode()
        try:
            # The browser-facing authorization endpoint is public HTTPS through the local
            # edge. The token exchange can use the private Docker-network endpoint so the
            # API does not have to hairpin through the development certificate.
            token_endpoint = settings.OIDC_TOKEN_ENDPOINT or discovery["token_endpoint"]
            token_request = urllib.request.Request(token_endpoint, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
            with urllib.request.urlopen(token_request, timeout=10) as response:
                token_set = json.load(response)
        except Exception as exc:
            raise ProviderNotConfigured(f"OIDC token exchange failed: {exc}") from exc

        id_token = token_set.get("id_token")
        if not id_token:
            raise ProviderNotConfigured("OIDC token response did not contain an ID token")
        try:
            signing_key = jwt.PyJWKClient(settings.OIDC_JWKS_URL or discovery["jwks_uri"]).get_signing_key_from_jwt(id_token).key
            claims = jwt.decode(id_token, signing_key, algorithms=["RS256", "ES256"], audience=settings.OIDC_AUDIENCE or settings.OIDC_CLIENT_ID, issuer=settings.OIDC_ISSUER_URL, options={"require": ["sub", "iss", "aud", "exp", "nonce"]})
        except Exception as exc:
            raise ProviderNotConfigured(f"OIDC ID token validation failed: {exc}") from exc

        if not secrets.compare_digest(str(claims.get("nonce", "")), str(nonce)):
            raise ProviderNotConfigured("OIDC nonce validation failed")

        if settings.OIDC_REQUIRE_MFA:
            amr = set(claims.get("amr", []))
            acr = str(claims.get("acr", "")).lower()
            if not ({"mfa", "otp", "hwk"} & amr or "mfa" in acr):
                raise ProviderNotConfigured("OIDC login did not satisfy the MFA requirement")
        return claims


class MobileDeliveryProvider:
    def deliver_otp_challenge(self, recipient_id: str, challenge_id: str, otp: str, expires_at: datetime):
        raise ProviderNotConfigured("authenticated mobile delivery provider is not configured")


class LocalMobileDeliveryProvider(MobileDeliveryProvider):
    """Development-only wake-up outbox; it never stores or emits the OTP."""

    def deliver_otp_challenge(self, recipient_id: str, challenge_id: str, otp: str, expires_at: datetime):
        from .models import EnrolledUser, OutboxMessage

        recipient = EnrolledUser.objects.get(id=recipient_id)
        # SECURITY-PLACEHOLDER: local delivery substitutes for FCM with a database wake-up event; production must use authenticated FCM delivery. See TODO_SECURITY_DEBT.md
        OutboxMessage.objects.create(
            tenant=recipient.tenant,
            topic=f"mobile/{recipient_id}/events",
            payload={"event_type": "otp_challenge_ready", "challenge_id": challenge_id, "expires_at": expires_at.isoformat()},
            available_at=timezone.now(),
        )


class FcmMobileDeliveryProvider(MobileDeliveryProvider):
    """FCM is a wake-up signal only; the OTP is never placed in the message payload."""

    def _access_token(self):
        if not settings.FCM_PROJECT_ID or not settings.FCM_SERVICE_ACCOUNT_FILE:
            raise ProviderNotConfigured("FCM project and service-account file are not configured")
        try:
            from google.auth.transport.requests import Request
            from google.oauth2 import service_account
            credentials = service_account.Credentials.from_service_account_file(settings.FCM_SERVICE_ACCOUNT_FILE, scopes=["https://www.googleapis.com/auth/firebase.messaging"])
            credentials.refresh(Request())
            return credentials.token
        except Exception as exc:
            raise ProviderNotConfigured(f"FCM credentials could not be loaded: {exc}") from exc

    def deliver_otp_challenge(self, recipient_id: str, challenge_id: str, otp: str, expires_at: datetime):
        from .models import Device

        device_tokens = list(Device.objects.filter(user_id=recipient_id, status="active").exclude(push_token="").values_list("push_token", flat=True))
        if not device_tokens:
            raise ProviderNotConfigured("recipient has no active FCM device registration")
        access_token = self._access_token()
        endpoint = f"https://fcm.googleapis.com/v1/projects/{settings.FCM_PROJECT_ID}/messages:send"
        for device_token in device_tokens:
            message = {"message": {"token": device_token, "data": {"event_type": "otp_challenge_ready", "challenge_id": challenge_id, "expires_at": expires_at.isoformat()}, "android": {"priority": "high"}}}
            request = urllib.request.Request(endpoint, data=json.dumps(message).encode(), headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    if response.status >= 300:
                        raise ProviderNotConfigured(f"FCM returned HTTP {response.status}")
            except ProviderNotConfigured:
                raise
            except Exception as exc:
                raise ProviderNotConfigured(f"FCM delivery failed: {exc}") from exc


@dataclass(frozen=True)
class SignedGrant:
    key_id: str
    signature: bytes


class KmsSigner:
    # SECURITY-PLACEHOLDER: KMS/HSM signing adapter is not configured - must be replaced before production. See TODO_SECURITY_DEBT.md
    def sign_unlock_grant(self, claims: bytes):
        raise ProviderNotConfigured("KMS/HSM signing provider is not configured")


class DevelopmentSigner(KmsSigner):
    # SECURITY-PLACEHOLDER: local ES256 signing key is generated and mounted only for the local demonstration; replace with a cloud KMS/HSM before production. See TODO_SECURITY_DEBT.md
    def sign_unlock_grant(self, claims: bytes):
        if not settings.DEV_MODE or not settings.DEV_SIGNING_PRIVATE_KEY_PATH:
            raise ProviderNotConfigured("development signing requires DEV_MODE and DEV_SIGNING_PRIVATE_KEY_PATH")
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import ec
            from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

            with open(settings.DEV_SIGNING_PRIVATE_KEY_PATH, "rb") as key_file:
                private_key = serialization.load_pem_private_key(key_file.read(), password=None)
            if not isinstance(private_key, ec.EllipticCurvePrivateKey):
                raise ValueError("development signing key must be an EC private key")
            der_signature = private_key.sign(claims, ec.ECDSA(hashes.SHA256()))
            r_value, s_value = decode_dss_signature(der_signature)
            coordinate_size = (private_key.curve.key_size + 7) // 8
            signature = r_value.to_bytes(coordinate_size, "big") + s_value.to_bytes(coordinate_size, "big")
        except Exception as exc:
            raise ProviderNotConfigured(f"development signing key could not be loaded: {exc}") from exc
        return SignedGrant(settings.DEV_SIGNING_KEY_ID, signature)


class MqttDeviceGateway:
    def publish_signed_grant(self, tenant_id: str, locker_id: str, command_id: str, payload: bytes):
        if not settings.MQTT_BROKER_URL or not settings.MQTT_CLIENT_CERT_PATH or not settings.MQTT_CLIENT_KEY_PATH or not settings.MQTT_CA_CERT_PATH:
            raise ProviderNotConfigured("MQTT broker and mTLS certificate paths are not configured")
        parsed = urllib.parse.urlparse(settings.MQTT_BROKER_URL)
        if parsed.scheme != "mqtts":
            raise ProviderNotConfigured("MQTT broker must use mqtts://")
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=settings.MQTT_CLIENT_ID, protocol=mqtt.MQTTv5)
        try:
            client.tls_set(ca_certs=settings.MQTT_CA_CERT_PATH, certfile=settings.MQTT_CLIENT_CERT_PATH, keyfile=settings.MQTT_CLIENT_KEY_PATH, tls_version=ssl.PROTOCOL_TLS_CLIENT)
            client.connect(parsed.hostname, parsed.port or 8883, keepalive=30)
            client.loop_start()
            result = client.publish(f"locks/{tenant_id}/{locker_id}/commands", payload=payload, qos=1)
            result.wait_for_publish(timeout=10)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                raise ProviderNotConfigured(f"MQTT publish failed with code {result.rc}")
        except ProviderNotConfigured:
            raise
        except Exception as exc:
            raise ProviderNotConfigured(f"MQTT connection failed: {exc}") from exc
        finally:
            client.loop_stop()
            client.disconnect()


def get_mobile_delivery_provider():
    if settings.OTP_DELIVERY_PROVIDER == "fcm":
        return FcmMobileDeliveryProvider()
    if settings.OTP_DELIVERY_PROVIDER == "local":
        return LocalMobileDeliveryProvider()
    return MobileDeliveryProvider()


def get_signer():
    return DevelopmentSigner() if settings.SIGNING_PROVIDER == "development" else KmsSigner()


def get_device_gateway():
    return MqttDeviceGateway()
