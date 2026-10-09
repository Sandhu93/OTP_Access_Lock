from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from core.models import EnrolledUser, Locker, LockerEnrollment, LockerPolicy, Site, Tenant


class Command(BaseCommand):
    help = "Create the non-production tenant used by the local Keycloak realm."

    def handle(self, *args, **options):
        bootstrap_user, _ = get_user_model().objects.get_or_create(username="local-bootstrap")
        tenant, _ = Tenant.objects.get_or_create(slug="northstar-bank", defaults={"name": "Northstar Bank"})
        site, _ = Site.objects.get_or_create(tenant=tenant, name="Mumbai Operations", defaults={"region": "Mumbai"})
        locker, _ = Locker.objects.get_or_create(tenant=tenant, hardware_id="LOCK-LOCAL-001", defaults={"site": site, "name": "Local Test Locker"})
        LockerPolicy.objects.get_or_create(locker=locker)
        person_a, _ = EnrolledUser.objects.update_or_create(
            tenant=tenant,
            oidc_subject="00000000-0000-4000-8000-0000000000a1",
            defaults={"display_name": "Person A", "employee_id": "DEMO-A", "title": "Requester", "status": "active"},
        )
        person_b, _ = EnrolledUser.objects.update_or_create(
            tenant=tenant,
            oidc_subject="00000000-0000-4000-8000-0000000000b1",
            defaults={"display_name": "Person B", "employee_id": "DEMO-B", "title": "Second party", "status": "active"},
        )
        for person in (person_a, person_b):
            LockerEnrollment.objects.get_or_create(locker=locker, user=person, defaults={"enrolled_by": bootstrap_user})
        self.stdout.write(self.style.SUCCESS(f"Development tenant ready: {tenant.slug}"))
