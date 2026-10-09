from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="device",
            name="push_token",
            field=models.CharField(blank=True, max_length=4096),
        ),
    ]
