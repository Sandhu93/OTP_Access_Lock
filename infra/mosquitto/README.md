# Local MQTT mTLS

The broker requires mutual TLS. Certificates are intentionally generated locally and are not
tracked by Git. Run the certificate script once before starting Docker Compose:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\mosquitto\generate-certs.ps1
```

The generated `backend` certificate is mounted into the API container. `lock-demo` is a sample
device identity for local firmware/client testing. Production provisioning must use a device CA,
certificate rotation, revocation, and broker ACLs managed by the deployment environment.
