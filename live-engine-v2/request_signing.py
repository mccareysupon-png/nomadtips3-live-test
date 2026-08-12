import base64
import hashlib
import os
import time
from urllib.parse import urlsplit

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def canonical_request(method, url, timestamp, nonce, body):
    path = urlsplit(url).path or "/"
    digest = hashlib.sha256(body).hexdigest()
    return f"{method.upper()}\n{path}\n{timestamp}\n{nonce}\n{digest}".encode("utf-8")


class RequestSigner:
    def __init__(self, private_key_b64):
        self.private_key_b64 = str(private_key_b64 or "").strip()

    @property
    def configured(self):
        return bool(self.private_key_b64)

    def headers(self, method, url, body=b""):
        if not self.configured:
            return {}
        raw = base64.b64decode(self.private_key_b64, validate=True)
        if len(raw) != 32:
            raise ValueError("V2 signing private key must be 32 raw Ed25519 bytes")
        timestamp = str(int(time.time()))
        nonce = os.urandom(16).hex()
        material = canonical_request(method, url, timestamp, nonce, body)
        signature = Ed25519PrivateKey.from_private_bytes(raw).sign(material)
        return {
            "X-Nomad-Timestamp": timestamp,
            "X-Nomad-Nonce": nonce,
            "X-Nomad-Signature": base64.b64encode(signature).decode("ascii"),
        }
