import argparse
import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


DEFAULTS = {
    "API_FOOTBALL_KEY": "",
    "LIVE_POLL_SECONDS": "15",
    "IDLE_POLL_SECONDS": "60",
    "REQUEST_TIMEOUT_SECONDS": "15",
    "SNAPSHOT_PATH": "/opt/nomadtips3-live-test/live-engine-v2/state/snapshot.json",
    "CONDITION_CONFIG_PATH": "/opt/nomadtips3-live-test/live-engine-v2/condition.json",
    "ENGINE_DB_PATH": "/opt/nomadtips3-live-test/live-engine-v2/state/car3-engine.sqlite3",
    "SIGNAL_INBOX_DIR": "/opt/nomadtips3-live-test/car3-bot/signals/inbox",
    "V2_PUBLISH_ENABLED": "true",
    "V2_INGEST_URL": "https://nomadtips3-test-api.mccarey-supon.workers.dev/v2/ingest",
    "V2_INGEST_SECRET": "",
    "V2_AUTH_MODE": "signed",
    "COLLECTOR_ID": "vps-primary",
    "PUBLISH_HEARTBEAT_SECONDS": "60",
    "V2_REMOTE_CONFIG_ENABLED": "true",
    "V2_CONFIG_URL": "https://nomadtips3-test-api.mccarey-supon.workers.dev/v2/collector/config",
    "V2_CONFIG_REFRESH_SECONDS": "15",
}


def parse_env(path):
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value
    return values


def raw_private_key(value):
    if value:
        raw = base64.b64decode(value, validate=True)
        if len(raw) != 32:
            raise ValueError("existing V2_SIGNING_PRIVATE_KEY_B64 is invalid")
        return Ed25519PrivateKey.from_private_bytes(raw)
    return Ed25519PrivateKey.generate()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    args = parser.parse_args()
    target = Path(args.env_file)
    target.parent.mkdir(parents=True, exist_ok=True)
    values = {**DEFAULTS, **parse_env(target)}
    private_key = raw_private_key(values.get("V2_SIGNING_PRIVATE_KEY_B64", ""))
    private_raw = private_key.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    public_raw = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    values["V2_SIGNING_PRIVATE_KEY_B64"] = base64.b64encode(private_raw).decode("ascii")
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(
        "".join(f"{key}={value}\n" for key, value in values.items()),
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)
    os.chmod(target, 0o600)
    print("V2_COLLECTOR_PUBLIC_KEY_B64=" + base64.b64encode(public_raw).decode("ascii"))


if __name__ == "__main__":
    main()
