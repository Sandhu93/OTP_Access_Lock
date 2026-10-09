from rest_framework import serializers

from .models import AuditLogEntry, Device, EnrolledUser, Locker, LockerPolicy, OtpChallenge, SecurityAlert, SignedUnlockGrant, Site, UnlockRequest


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ["id", "name", "region", "status"]


class LockerPolicySerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        required = attrs.get("required_count", getattr(self.instance, "required_count", 2))
        enrolled = attrs.get("enrolled_count", getattr(self.instance, "enrolled_count", 3))
        if required < 1 or required > enrolled:
            raise serializers.ValidationError("required_count must be between 1 and enrolled_count")
        return attrs

    class Meta:
        model = LockerPolicy
        fields = ["required_count", "enrolled_count", "updated_at"]
        read_only_fields = ["updated_at"]


class LockerSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)
    policy = LockerPolicySerializer(read_only=True)

    class Meta:
        model = Locker
        fields = ["id", "name", "hardware_id", "site", "site_name", "status", "last_seen_at", "firmware_version", "policy"]
        read_only_fields = ["id", "status", "last_seen_at"]

    def validate_site(self, site):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is None and request:
            from .permissions import tenant_for_request

            tenant = tenant_for_request(request)
        if tenant is None or site.tenant_id != tenant.id:
            raise serializers.ValidationError("site must belong to the active tenant")
        return site


class EnrolledUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnrolledUser
        fields = ["id", "display_name", "employee_id", "title", "status", "created_at"]
        read_only_fields = ["id", "created_at"]


class DeviceSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.display_name", read_only=True)

    class Meta:
        model = Device
        fields = ["id", "user", "user_name", "platform", "public_key_fingerprint", "status", "last_seen_at", "revoked_at"]
        read_only_fields = ["id", "public_key_fingerprint", "last_seen_at", "revoked_at"]


class UnlockRequestSerializer(serializers.ModelSerializer):
    locker_name = serializers.CharField(source="locker.name", read_only=True)
    site_name = serializers.CharField(source="locker.site.name", read_only=True)
    requester_name = serializers.CharField(source="requester.display_name", read_only=True)
    second_party_name = serializers.CharField(source="second_party.display_name", read_only=True, allow_null=True)
    otp_challenge_id = serializers.SerializerMethodField()
    otp_delivery_status = serializers.SerializerMethodField()
    grant_id = serializers.SerializerMethodField()
    grant_published_at = serializers.SerializerMethodField()

    @staticmethod
    def _challenge(obj):
        try:
            return obj.otp_challenge
        except OtpChallenge.DoesNotExist:
            return None

    def get_otp_challenge_id(self, obj):
        challenge = self._challenge(obj)
        return str(challenge.id) if challenge else None

    def get_otp_delivery_status(self, obj):
        challenge = self._challenge(obj)
        return challenge.delivery_status if challenge else None

    def get_grant_id(self, obj):
        grant = SignedUnlockGrant.objects.filter(request=obj).only("id").first()
        return str(grant.id) if grant else None

    def get_grant_published_at(self, obj):
        grant = SignedUnlockGrant.objects.filter(request=obj).only("published_at").first()
        return grant.published_at if grant else None

    class Meta:
        model = UnlockRequest
        fields = ["id", "locker", "locker_name", "site_name", "requester", "requester_name", "second_party", "second_party_name", "status", "reason", "admin_review_reason", "requested_at", "expires_at", "otp_challenge_id", "otp_delivery_status", "grant_id", "grant_published_at"]
        read_only_fields = ["id", "status", "admin_review_reason", "requested_at", "expires_at"]


class ReviewSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=2000)
    second_party_id = serializers.UUIDField(required=False)


class AuditLogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLogEntry
        fields = ["id", "actor_type", "actor_id", "event_type", "request_id", "details", "created_at"]


class SecurityAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecurityAlert
        fields = ["id", "locker", "severity", "category", "message", "acknowledged_at", "created_at"]


class MobileDeviceRegistrationSerializer(serializers.Serializer):
    platform = serializers.ChoiceField(choices=["android", "ios"])
    public_key_fingerprint = serializers.CharField(min_length=16, max_length=128)
    push_token = serializers.CharField(max_length=4096, required=False, allow_blank=True)


class MobilePresenceSerializer(serializers.Serializer):
    request_id = serializers.UUIDField()
    locker_id = serializers.UUIDField()
    ble_session_id = serializers.RegexField(regex=r"^[0-9a-fA-F]{16}$")


class MobileHeartbeatSerializer(serializers.Serializer):
    ble_session_id = serializers.RegexField(regex=r"^[0-9a-fA-F]{16}$", required=False)


class MobileOtpVerifySerializer(serializers.Serializer):
    otp = serializers.RegexField(regex=r"^\d{6}$")


class MobileUnlockRequestSerializer(serializers.Serializer):
    locker_id = serializers.UUIDField()
    reason = serializers.CharField(min_length=3, max_length=2000)
    ble_session_id = serializers.RegexField(regex=r"^[0-9a-fA-F]{16}$")
    second_party_id = serializers.UUIDField(required=False)
