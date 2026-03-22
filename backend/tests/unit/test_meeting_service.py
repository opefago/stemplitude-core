"""Unit tests for MeetingService — OAuth repo and providers are mocked."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.integrations.meeting_service import (
    MeetingService,
    MeetingServiceError,
    MeetingResult,
    PROVIDER_MAP,
)

pytestmark = pytest.mark.unit


@pytest.fixture
def mock_oauth_repo():
    repo = AsyncMock()
    repo.get_by_provider = AsyncMock(return_value=None)
    repo.update = AsyncMock()
    return repo


@pytest.fixture
def meeting_svc(mock_db, mock_oauth_repo):
    svc = MeetingService(mock_db)
    svc.oauth_repo = mock_oauth_repo
    return svc


def _make_connection(
    *,
    is_active: bool = True,
    access_token: str = "tok_valid",
    refresh_token: str | None = "ref_tok",
    expires_at: datetime | None = None,
):
    conn = MagicMock()
    conn.is_active = is_active
    conn.access_token_enc = access_token
    conn.refresh_token_enc = refresh_token
    conn.token_expires_at = expires_at
    return conn


class TestCreateMeeting:
    async def test_unsupported_provider_raises(self, meeting_svc):
        with pytest.raises(MeetingServiceError, match="Unsupported meeting provider"):
            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="webex", title="Test",
            )

    async def test_no_oauth_connection_raises(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = None

        with pytest.raises(MeetingServiceError, match="No zoom account linked") as exc_info:
            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Test",
            )
        assert exc_info.value.status_code == 422

    async def test_inactive_connection_raises(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection(is_active=False)

        with pytest.raises(MeetingServiceError, match="No meet account linked"):
            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="meet", title="Test",
            )

    async def test_provider_returns_empty_link_raises_502(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection()

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.create_meeting.return_value = {"id": "m123", "join_url": ""}
            mock_build.return_value = provider

            with pytest.raises(MeetingServiceError, match="returned no meeting link") as exc_info:
                await meeting_svc.create_meeting(
                    user_id=uuid4(), tenant_id=uuid4(),
                    provider_key="zoom", title="Test",
                )
            assert exc_info.value.status_code == 502

    async def test_happy_path_zoom(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection()

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.create_meeting.return_value = {
                "id": "zoom-123",
                "join_url": "https://zoom.us/j/123",
            }
            mock_build.return_value = provider

            result = await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Robotics 101",
            )

        assert isinstance(result, MeetingResult)
        assert result.meeting_link == "https://zoom.us/j/123"
        assert result.external_meeting_id == "zoom-123"
        assert result.provider == "zoom"

    async def test_happy_path_meet_maps_to_google(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection()

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.create_meeting.return_value = {
                "id": "evt-456",
                "join_url": "https://meet.google.com/abc-def",
            }
            mock_build.return_value = provider

            result = await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="meet", title="Science Lab",
            )

        mock_oauth_repo.get_by_provider.assert_called_once()
        call_args = mock_oauth_repo.get_by_provider.call_args
        assert call_args[0][2] == "google"
        assert result.provider == "google"

    async def test_happy_path_teams_maps_to_microsoft(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection()

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.create_meeting.return_value = {
                "id": "teams-789",
                "join_url": "https://teams.microsoft.com/meet/abc",
            }
            mock_build.return_value = provider

            result = await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="teams", title="Math Class",
            )

        call_args = mock_oauth_repo.get_by_provider.call_args
        assert call_args[0][2] == "microsoft"
        assert result.provider == "microsoft"

    async def test_custom_start_end_passed_to_provider(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection()
        start = datetime(2026, 4, 1, 10, 0, tzinfo=timezone.utc)
        end = datetime(2026, 4, 1, 11, 30, tzinfo=timezone.utc)

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.create_meeting.return_value = {
                "id": "m1", "join_url": "https://zoom.us/j/1",
            }
            mock_build.return_value = provider

            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Timed",
                start=start, end=end,
            )

            call_kwargs = provider.create_meeting.call_args[1]
            assert call_kwargs["start"] == start
            assert call_kwargs["end"] == end


class TestTokenRefresh:
    async def test_expired_token_refreshes_successfully(self, meeting_svc, mock_oauth_repo):
        expired = datetime.now(timezone.utc) - timedelta(minutes=5)
        conn = _make_connection(expires_at=expired, refresh_token="ref_tok")
        mock_oauth_repo.get_by_provider.return_value = conn

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.refresh_access_token.return_value = ("new_tok", 3600)
            provider.create_meeting.return_value = {
                "id": "m1", "join_url": "https://zoom.us/j/1",
            }
            mock_build.return_value = provider

            result = await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Test",
            )

        mock_oauth_repo.update.assert_called_once()
        update_kwargs = mock_oauth_repo.update.call_args[1]
        assert update_kwargs["access_token_enc"] == "new_tok"
        assert result.meeting_link == "https://zoom.us/j/1"

    async def test_expired_token_no_refresh_token_raises(self, meeting_svc, mock_oauth_repo):
        expired = datetime.now(timezone.utc) - timedelta(minutes=5)
        conn = _make_connection(expires_at=expired, refresh_token=None)
        mock_oauth_repo.get_by_provider.return_value = conn

        with pytest.raises(MeetingServiceError, match="no refresh token") as exc_info:
            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Test",
            )
        assert exc_info.value.status_code == 401

    async def test_refresh_returns_empty_token_raises(self, meeting_svc, mock_oauth_repo):
        expired = datetime.now(timezone.utc) - timedelta(minutes=5)
        conn = _make_connection(expires_at=expired, refresh_token="ref_tok")
        mock_oauth_repo.get_by_provider.return_value = conn

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.refresh_access_token.return_value = ("", None)
            mock_build.return_value = provider

            with pytest.raises(MeetingServiceError, match="Failed to refresh") as exc_info:
                await meeting_svc.create_meeting(
                    user_id=uuid4(), tenant_id=uuid4(),
                    provider_key="zoom", title="Test",
                )
            assert exc_info.value.status_code == 401

    async def test_no_access_token_stored_raises(self, meeting_svc, mock_oauth_repo):
        conn = _make_connection(access_token=None, expires_at=None)
        mock_oauth_repo.get_by_provider.return_value = conn

        with pytest.raises(MeetingServiceError, match="No access token stored") as exc_info:
            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Test",
            )
        assert exc_info.value.status_code == 401

    async def test_valid_non_expired_token_not_refreshed(self, meeting_svc, mock_oauth_repo):
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        conn = _make_connection(expires_at=future)
        mock_oauth_repo.get_by_provider.return_value = conn

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.create_meeting.return_value = {
                "id": "m1", "join_url": "https://zoom.us/j/1",
            }
            mock_build.return_value = provider

            await meeting_svc.create_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", title="Test",
            )

        provider.refresh_access_token.assert_not_called()
        mock_oauth_repo.update.assert_not_called()


class TestDeleteMeeting:
    async def test_unsupported_provider_returns_false(self, meeting_svc):
        result = await meeting_svc.delete_meeting(
            user_id=uuid4(), tenant_id=uuid4(),
            provider_key="webex", external_meeting_id="m1",
        )
        assert result is False

    async def test_no_connection_returns_false(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = None

        result = await meeting_svc.delete_meeting(
            user_id=uuid4(), tenant_id=uuid4(),
            provider_key="zoom", external_meeting_id="m1",
        )
        assert result is False

    async def test_happy_path_delegates_to_provider(self, meeting_svc, mock_oauth_repo):
        mock_oauth_repo.get_by_provider.return_value = _make_connection()

        with patch.object(meeting_svc, "_build_provider") as mock_build:
            provider = AsyncMock()
            provider.delete_meeting.return_value = True
            mock_build.return_value = provider

            result = await meeting_svc.delete_meeting(
                user_id=uuid4(), tenant_id=uuid4(),
                provider_key="zoom", external_meeting_id="zoom-123",
            )

        assert result is True
        provider.delete_meeting.assert_called_once_with("tok_valid", "zoom-123")


class TestProviderMap:
    def test_all_aliases_resolve(self):
        assert PROVIDER_MAP["zoom"] == "zoom"
        assert PROVIDER_MAP["meet"] == "google"
        assert PROVIDER_MAP["google"] == "google"
        assert PROVIDER_MAP["teams"] == "microsoft"
        assert PROVIDER_MAP["microsoft"] == "microsoft"

    def test_unknown_key_returns_none(self):
        assert PROVIDER_MAP.get("webex") is None
        assert PROVIDER_MAP.get("") is None


class TestMeetingServiceError:
    def test_default_status_code(self):
        err = MeetingServiceError("boom")
        assert err.status_code == 400
        assert err.message == "boom"

    def test_custom_status_code(self):
        err = MeetingServiceError("auth fail", status_code=401)
        assert err.status_code == 401
