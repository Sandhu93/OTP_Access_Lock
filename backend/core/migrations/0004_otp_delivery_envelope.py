from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0003_enrolled_user_oidc_subject")]

    operations = [
        migrations.AddField(
            model_name="otpchallenge",
            name="otp_ciphertext",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="otpchallenge",
            name="delivery_status",
            field=models.CharField(default="pending", max_length=24),
        ),
    ]
