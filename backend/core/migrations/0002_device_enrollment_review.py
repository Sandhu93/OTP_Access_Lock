import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_otp_delivery_envelope"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="device",
            name="status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("active", "Active"), ("rejected", "Rejected"), ("revoked", "Revoked")],
                default="pending",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="device",
            name="enrollment_requested_at",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="device",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="device",
            name="review_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="device",
            name="reviewed_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviewed_mobile_devices", to=settings.AUTH_USER_MODEL),
        ),
    ]
