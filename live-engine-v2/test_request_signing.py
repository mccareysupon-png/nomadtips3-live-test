import base64
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from request_signing import RequestSigner, canonical_request


class RequestSigningTests(unittest.TestCase):
    def test_signature_matches_public_key_and_canonical_body(self):
        private_key = Ed25519PrivateKey.generate()
        private_raw = private_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
        signer = RequestSigner(base64.b64encode(private_raw).decode("ascii"))
        body = b'{"collector":"vps"}'
        url = "https://example.test/v2/ingest?ignored=query"
        headers = signer.headers("POST", url, body)
        material = canonical_request(
            "POST",
            url,
            headers["X-Nomad-Timestamp"],
            headers["X-Nomad-Nonce"],
            body,
        )
        signature = base64.b64decode(headers["X-Nomad-Signature"])
        private_key.public_key().verify(signature, material)
        self.assertRegex(headers["X-Nomad-Nonce"], r"^[a-f0-9]{32}$")


if __name__ == "__main__":
    unittest.main()
