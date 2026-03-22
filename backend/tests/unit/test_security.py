"""Unit tests for core security utilities (token creation, PII masking)."""

from uuid import uuid4

import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


pytestmark = pytest.mark.unit


class TestPasswordHashing:
    def test_round_trip(self):
        hashed = hash_password("secret123")
        assert verify_password("secret123", hashed)

    def test_wrong_password_fails(self):
        hashed = hash_password("secret123")
        assert not verify_password("wrong", hashed)

    def test_different_hashes(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # bcrypt produces unique salts


class TestAccessToken:
    def test_contains_required_claims(self):
        uid = uuid4()
        token = create_access_token(sub=uid, sub_type="user")
        payload = decode_token(token)

        assert payload["sub"] == str(uid)
        assert payload["sub_type"] == "user"
        assert payload["type"] == "access"
        assert "jti" in payload
        assert "iat" in payload
        assert "exp" in payload

    def test_jti_is_unique(self):
        uid = uuid4()
        t1 = create_access_token(sub=uid)
        t2 = create_access_token(sub=uid)
        p1, p2 = decode_token(t1), decode_token(t2)
        assert p1["jti"] != p2["jti"]

    def test_extra_claims(self):
        uid = uuid4()
        token = create_access_token(
            sub=uid, extra_claims={"is_super_admin": True}
        )
        payload = decode_token(token)
        assert payload["is_super_admin"] is True

    def test_tenant_and_role(self):
        uid = uuid4()
        tid = uuid4()
        token = create_access_token(
            sub=uid, tenant_id=tid, role="admin"
        )
        payload = decode_token(token)
        assert payload["tenant_id"] == str(tid)
        assert payload["role"] == "admin"


class TestRefreshToken:
    def test_returns_tuple_with_jti(self):
        uid = uuid4()
        token, jti = create_refresh_token(sub=uid)

        assert isinstance(token, str)
        assert isinstance(jti, str)
        assert len(jti) == 32  # uuid4().hex

    def test_jti_matches_payload(self):
        uid = uuid4()
        token, jti = create_refresh_token(sub=uid)
        payload = decode_token(token)

        assert payload["jti"] == jti
        assert payload["type"] == "refresh"
        assert payload["sub"] == str(uid)

    def test_unique_jtis(self):
        uid = uuid4()
        _, jti1 = create_refresh_token(sub=uid)
        _, jti2 = create_refresh_token(sub=uid)
        assert jti1 != jti2


class TestDecodeToken:
    def test_invalid_token_returns_empty(self):
        assert decode_token("not-a-jwt") == {}

    def test_valid_token_round_trips(self):
        uid = uuid4()
        token = create_access_token(sub=uid)
        payload = decode_token(token)
        assert payload["sub"] == str(uid)


class TestPIIMasking:
    def test_mask_email(self):
        from app.core.logging import mask_email

        masked = mask_email("john.doe@example.com")
        assert "john.doe" not in masked
        assert "@" in masked
        assert masked.endswith(".com")

    def test_mask_value_short(self):
        from app.core.logging import mask_value

        assert mask_value("ab") == "a*"  # 2-char values keep first char + mask

    def test_mask_value_long(self):
        from app.core.logging import mask_value

        masked = mask_value("username123")
        assert masked[0] == "u"
        assert masked[-1] == "3"
        assert "*" in masked

    def test_mask_pii_in_text(self):
        from app.core.logging import mask_pii

        text = "User email is alice@example.com and phone is +1-555-123-4567"
        masked = mask_pii(text)
        assert "alice@example.com" not in masked
        assert "555-123-4567" not in masked

    def test_mask_email_empty(self):
        from app.core.logging import mask_email

        assert mask_email("") == "***"
        assert mask_email("not-an-email") == "***"

    def test_mask_email_short_local(self):
        from app.core.logging import mask_email

        masked = mask_email("a@b.co")
        assert "@" in masked
        assert masked.endswith(".co")

    def test_mask_value_empty(self):
        from app.core.logging import mask_value

        assert mask_value("") == "***"

    def test_mask_value_single_char(self):
        from app.core.logging import mask_value

        assert mask_value("x") == "x*"

    def test_mask_pii_no_pii_unchanged(self):
        from app.core.logging import mask_pii

        text = "No sensitive data here, just classroom info."
        assert mask_pii(text) == text

    def test_mask_pii_multiple_emails(self):
        from app.core.logging import mask_pii

        text = "CC: alice@test.com, bob@example.org"
        masked = mask_pii(text)
        assert "alice@test.com" not in masked
        assert "bob@example.org" not in masked
        assert masked.count("@") == 2

    def test_mask_pii_email_in_json_log(self):
        from app.core.logging import mask_pii

        text = '{"user": "admin@school.edu", "action": "login"}'
        masked = mask_pii(text)
        assert "admin@school.edu" not in masked
        assert "@" in masked

    def test_pii_filter_masks_string_args(self):
        import logging
        from app.core.logging import PIIFilter

        f = PIIFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="User %s logged in", args=("alice@example.com",), exc_info=None,
        )
        f.filter(record)
        assert "alice@example.com" not in str(record.args)

    def test_pii_filter_masks_dict_args(self):
        import logging
        from app.core.logging import PIIFilter

        f = PIIFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="User %(email)s logged in",
            args=None, exc_info=None,
        )
        record.args = {"email": "bob@test.com"}
        f.filter(record)
        assert "bob@test.com" not in str(record.args)

    def test_pii_filter_passes_non_string_args(self):
        import logging
        from app.core.logging import PIIFilter

        f = PIIFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Count: %d", args=(42,), exc_info=None,
        )
        f.filter(record)
        assert record.args == (42,)
