import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_device_enrollment_review")]

    operations = [
        migrations.AlterField(
            model_name="presencesession",
            name="request",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="presence_sessions",
                to="core.unlockrequest",
            ),
        ),
    ]
