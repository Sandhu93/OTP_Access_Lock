# Cloud KMS unlock-grant signer

The backend signs canonical grant claims with a Cloud KMS asymmetric P-256/SHA-256 key. KMS
returns an ASN.1 DER ECDSA signature; the backend converts it to the 64-byte `r || s` ES256
encoding verified by the ESP32.

The demo Cloud Run deployment uses:

- Key version: `projects/n8nproject-471110/locations/asia-south1/keyRings/access-lock/cryptoKeys/unlock-grant/cryptoKeyVersions/1`
- Firmware key ID: `access-lock-kms-v1`
- Firmware public key: `unlock-grant-public.pem`
- Runtime signer: `SIGNING_PROVIDER=kms`, `KMS_KEY_ID=<key-version-resource-name>`, and
  `UNLOCK_SIGNING_KEY_ID=access-lock-kms-v1`

Grant signing permissions belong only to the Cloud Run service account through
`roles/cloudkms.signerVerifier` on this key. The private key is non-exportable. Do not create an
automatic key rotation schedule without coordinating a firmware trust-key rollout: the lock
accepts only the public key and key ID compiled into its firmware.

For a local firmware build with the Cloud KMS public key, pass `-SigningPublicKeyPath
infra\kms\unlock-grant-public.pem -SigningKeyId access-lock-kms-v1` to
`scripts/prepare-esp32-demo.ps1`. That script writes an ignored local header containing device
credentials; never commit that generated header.
