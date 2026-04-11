"""Verify SendGrid signed Event Webhook (ECDSA). Logic from sendgrid-python EventWebhook (MIT)."""

from __future__ import annotations

import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import load_pem_public_key


def verify_sendgrid_event_signature(
    *,
    public_key_pem_body: str,
    payload_text: str,
    signature_b64: str,
    timestamp: str,
) -> bool:
    """``public_key_pem_body`` is the base64 block from SendGrid (without PEM headers)."""
    body = (public_key_pem_body or "").strip()
    if not body:
        return False
    pem = f"-----BEGIN PUBLIC KEY-----\n{body}\n-----END PUBLIC KEY-----"
    key = load_pem_public_key(pem.encode("utf-8"))
    if not isinstance(key, ec.EllipticCurvePublicKey):
        return False
    ts_payload = (timestamp + payload_text).encode("utf-8")
    try:
        sig = base64.b64decode((signature_b64 or "").strip())
        key.verify(sig, ts_payload, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
