from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_device_push_token")]

    operations = [
        migrations.AddField(
            model_name="enrolleduser",
            name="oidc_subject",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
