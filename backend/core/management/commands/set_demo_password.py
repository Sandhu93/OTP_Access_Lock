from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from core.demo_auth import mobile_login_username
from core.models import EnrolledUser, Tenant, TenantMembership


class Command(BaseCommand):
    help = "Set a temporary demo password for one tenant admin or active enrolled mobile user."

    def add_arguments(self, parser):
        parser.add_argument("--kind", choices=("admin", "mobile"), required=True)
        parser.add_argument("--tenant", required=True, help="Tenant slug")
        parser.add_argument("--username", help="Required for --kind admin")
        parser.add_argument("--employee-id", help="Required for --kind mobile")
        parser.add_argument("--role", choices=("owner", "admin", "operator", "viewer"), default="admin")

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug=options["tenant"], status="active").first()
        if not tenant:
            raise CommandError("An active tenant with that slug was not found.")

        if options["kind"] == "admin":
            username = (options.get("username") or "").strip()
            if not username:
                raise CommandError("--username is required for --kind admin.")
            user, _ = get_user_model().objects.get_or_create(username=username)
            TenantMembership.objects.update_or_create(
                tenant=tenant,
                admin_user=user,
                defaults={"role": options["role"], "oidc_subject": f"demo-password:{user.pk}", "active": True},
            )
            account_label = username
        else:
            employee_id = (options.get("employee_id") or "").strip()
            if not employee_id:
                raise CommandError("--employee-id is required for --kind mobile.")
            identity = EnrolledUser.objects.filter(
                tenant=tenant, employee_id=employee_id, status="active"
            ).first()
            if not identity:
                raise CommandError("An active enrolled mobile user with that employee ID was not found.")
            user, _ = get_user_model().objects.get_or_create(
                username=mobile_login_username(identity.pk),
                defaults={"first_name": identity.display_name[:150]},
            )
            account_label = f"{employee_id} ({tenant.slug})"

        first = getpass("New demo password (minimum 12 characters): ")
        second = getpass("Confirm password: ")
        if first != second:
            raise CommandError("Passwords did not match.")
        try:
            validate_password(first, user=user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        user.set_password(first)
        user.is_active = True
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Demo password updated for {account_label}. The password was not displayed."))
