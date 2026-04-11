"""Unit tests for CapabilityEngine — repository is mocked."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.capabilities.engine import Allow, CapabilityEngine, Deny
from app.capabilities.models import Capability, CapabilityRule
from app.capabilities.repository import CapabilityEngineRepository
from app.dependencies import CurrentIdentity, TenantContext


pytestmark = pytest.mark.unit


@pytest.fixture
def identity():
    return CurrentIdentity(
        id=uuid4(),
        sub_type="user",
        is_super_admin=False,
        tenant_id=uuid4(),
        role="admin",
    )


@pytest.fixture
def tenant_ctx(identity):
    return TenantContext(
        tenant_id=identity.tenant_id,
        tenant_slug="test-center",
        role="admin",
        permissions={"students:create", "classrooms:create"},
    )


@pytest.fixture
def mock_repo():
    repo = AsyncMock(spec=CapabilityEngineRepository)
    repo.get_capability_with_rules.return_value = (None, [])
    repo.get_active_license.return_value = None
    repo.get_hierarchy_link.return_value = None
    repo.has_license_feature.return_value = False
    repo.get_seat_usage.return_value = None
    repo.is_lab_disabled.return_value = False
    repo.get_central_child_ids.return_value = []
    repo.count_active_students.return_value = 0
    repo.count_instructors.return_value = 0
    repo.get_seat_current_count.return_value = 0
    return repo


@pytest.fixture
def engine(mock_repo):
    return CapabilityEngine(mock_repo)


def _make_capability(key: str = "test_cap") -> MagicMock:
    cap = MagicMock(spec=Capability)
    cap.id = uuid4()
    cap.key = key
    return cap


def _make_rule(
    *,
    role_required: str | None = None,
    required_feature: str | None = None,
    seat_type: str | None = None,
    limit_key: str | None = None,
) -> MagicMock:
    rule = MagicMock(spec=CapabilityRule)
    rule.role_required = role_required
    rule.required_feature = required_feature
    rule.seat_type = seat_type
    rule.limit_key = limit_key
    return rule


class TestCapabilityCheck:
    async def test_unknown_capability_denied(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        mock_repo.get_capability_with_rules.return_value = (None, [])

        result = await engine.can(identity, tenant_ctx, "nonexistent")

        assert result.allowed is False
        assert "Unknown capability" in result.reason

    async def test_cached_allow(self, engine, identity, tenant_ctx, fake_redis):
        cache_key = f"cap:{tenant_ctx.tenant_id}:{identity.id}:cached_cap"
        await fake_redis.setex(cache_key, 60, "1")

        result = await engine.can(identity, tenant_ctx, "cached_cap")

        assert result.allowed is True

    async def test_cached_deny(self, engine, identity, tenant_ctx, fake_redis):
        cache_key = f"cap:{tenant_ctx.tenant_id}:{identity.id}:cached_cap"
        await fake_redis.setex(cache_key, 60, "Feature not included in your plan")

        result = await engine.can(identity, tenant_ctx, "cached_cap")

        assert result.allowed is False
        assert result.reason == "Feature not included in your plan"

    async def test_no_rules_allows(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("open_cap")
        mock_repo.get_capability_with_rules.return_value = (cap, [])

        result = await engine.can(identity, tenant_ctx, "open_cap")

        assert result.allowed is True

    async def test_role_required_denied(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        tenant_ctx.permissions = set()
        cap = _make_capability("restricted")
        rule = _make_rule(role_required="admin:manage")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        result = await engine.can(identity, tenant_ctx, "restricted")

        assert result.allowed is False
        assert "Insufficient role" in result.reason

    async def test_role_required_allowed_with_wildcard(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        tenant_ctx.permissions = {"students:*"}
        cap = _make_capability("create_student")
        rule = _make_rule(role_required="students:create")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        result = await engine.can(identity, tenant_ctx, "create_student")

        assert result.allowed is True

    async def test_feature_denied_no_license(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("access_robotics_lab")
        rule = _make_rule(required_feature="access_robotics_lab")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])
        mock_repo.get_active_license.return_value = None
        mock_repo.get_hierarchy_link.return_value = None

        result = await engine.can(identity, tenant_ctx, "access_robotics_lab")

        assert result.allowed is False
        assert "No active license" in result.reason

    async def test_feature_denied_not_in_plan(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("access_robotics_lab")
        rule = _make_rule(required_feature="access_robotics_lab")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = False

        result = await engine.can(identity, tenant_ctx, "access_robotics_lab")

        assert result.allowed is False
        assert "Feature not included" in result.reason

    async def test_feature_allowed(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("access_robotics_lab")
        rule = _make_rule(required_feature="access_robotics_lab")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = True

        result = await engine.can(identity, tenant_ctx, "access_robotics_lab")

        assert result.allowed is True

    async def test_seat_limit_denied(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("add_student")
        rule = _make_rule(seat_type="student")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])
        mock_repo.get_hierarchy_link.return_value = None

        seat = MagicMock()
        seat.current_count = 10
        seat.max_count = 10
        mock_repo.get_seat_usage.return_value = seat

        result = await engine.can(identity, tenant_ctx, "add_student")

        assert result.allowed is False
        assert "Seat limit" in result.reason

    async def test_seat_limit_ok(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("add_student")
        rule = _make_rule(seat_type="student")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])
        mock_repo.get_hierarchy_link.return_value = None

        seat = MagicMock()
        seat.current_count = 5
        seat.max_count = 10
        mock_repo.get_seat_usage.return_value = seat

        result = await engine.can(identity, tenant_ctx, "add_student")

        assert result.allowed is True

    async def test_lab_disabled_by_org(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        cap = _make_capability("access_electronics_lab")
        rule = _make_rule(required_feature="access_electronics_lab")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = True
        mock_repo.is_lab_disabled.return_value = True

        result = await engine.can(identity, tenant_ctx, "access_electronics_lab")

        assert result.allowed is False
        assert "disabled by your organization" in result.reason

    async def test_lab_disabled_by_org_game_maker(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        """Org toggle applies to access_game_maker (not only keys ending in _lab)."""
        cap = _make_capability("access_game_maker")
        rule = _make_rule(required_feature="access_game_maker")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = True
        mock_repo.is_lab_disabled.return_value = True

        result = await engine.can(identity, tenant_ctx, "access_game_maker")

        assert result.allowed is False
        assert "disabled by your organization" in result.reason


class TestLicenseResolution:
    async def test_direct_license(self, engine, mock_repo):
        tenant_id = uuid4()
        license_ = MagicMock()
        mock_repo.get_active_license.return_value = license_

        result = await engine._resolve_license(tenant_id)

        assert result is license_
        mock_repo.get_hierarchy_link.assert_not_called()

    async def test_fallback_to_parent_license(self, engine, mock_repo):
        tenant_id = uuid4()
        parent_license = MagicMock()
        link = MagicMock()
        link.billing_mode = "central"
        link.parent_tenant_id = uuid4()

        mock_repo.get_active_license.side_effect = [None, parent_license]
        mock_repo.get_hierarchy_link.return_value = link

        result = await engine._resolve_license(tenant_id)

        assert result is parent_license

    async def test_independent_child_no_fallback(self, engine, mock_repo):
        tenant_id = uuid4()
        link = MagicMock()
        link.billing_mode = "independent"

        mock_repo.get_active_license.return_value = None
        mock_repo.get_hierarchy_link.return_value = link

        result = await engine._resolve_license(tenant_id)

        assert result is None


class TestMultiRuleCapabilities:
    """Edge cases: capabilities with multiple rules that must all pass."""

    async def test_role_and_feature_both_required(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        """A capability requiring both a role AND a feature — both satisfied."""
        tenant_ctx.permissions = {"students:create"}
        cap = _make_capability("create_student")
        rule = _make_rule(role_required="students:create", required_feature="create_student")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = True

        result = await engine.can(identity, tenant_ctx, "create_student")
        assert result.allowed is True

    async def test_role_ok_but_feature_missing_denied(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        """Role check passes but feature check fails."""
        tenant_ctx.permissions = {"students:create"}
        cap = _make_capability("create_student")
        rule = _make_rule(role_required="students:create", required_feature="create_student")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = False

        result = await engine.can(identity, tenant_ctx, "create_student")
        assert result.allowed is False
        assert "Feature not included" in result.reason

    async def test_two_rules_first_passes_second_denies(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        """Two separate rules: first passes (role), second fails (seat limit)."""
        tenant_ctx.permissions = {"students:create"}
        cap = _make_capability("add_student_with_seat")
        rule_role = _make_rule(role_required="students:create")
        rule_seat = _make_rule(seat_type="student")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule_role, rule_seat])
        mock_repo.get_hierarchy_link.return_value = None

        seat = MagicMock()
        seat.current_count = 50
        seat.max_count = 50
        mock_repo.get_seat_usage.return_value = seat

        result = await engine.can(identity, tenant_ctx, "add_student_with_seat")
        assert result.allowed is False
        assert "Seat limit" in result.reason

    async def test_empty_permissions_set_denies_role_check(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        tenant_ctx.permissions = set()
        cap = _make_capability("any_cap")
        rule = _make_rule(role_required="anything:do")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        result = await engine.can(identity, tenant_ctx, "any_cap")
        assert result.allowed is False

    async def test_feature_only_rule_no_role_required(self, engine, identity, tenant_ctx, mock_repo, fake_redis):
        """A rule with only required_feature, no role gate."""
        cap = _make_capability("access_design_maker")
        rule = _make_rule(required_feature="access_design_maker")
        mock_repo.get_capability_with_rules.return_value = (cap, [rule])

        license_ = MagicMock()
        license_.id = uuid4()
        mock_repo.get_active_license.return_value = license_
        mock_repo.has_license_feature.return_value = True

        result = await engine.can(identity, tenant_ctx, "access_design_maker")
        assert result.allowed is True


class TestSeatHierarchy:
    async def test_central_child_allocation_limit(self, engine, mock_repo):
        """Central child with seat allocation that's full."""
        tenant_id = uuid4()
        link = MagicMock()
        link.billing_mode = "central"
        link.parent_tenant_id = uuid4()
        link.seat_allocations = {"student": 5}
        mock_repo.get_hierarchy_link.return_value = link
        mock_repo.count_active_students.return_value = 5

        result = await engine._check_seat_availability(tenant_id, "student")
        assert result is not None
        assert result.allowed is False
        assert "allocation limit" in result.reason

    async def test_central_child_under_allocation_ok(self, engine, mock_repo):
        tenant_id = uuid4()
        link = MagicMock()
        link.billing_mode = "central"
        link.parent_tenant_id = uuid4()
        link.seat_allocations = {"student": 10}
        mock_repo.get_hierarchy_link.return_value = link
        mock_repo.count_active_students.return_value = 3

        result = await engine._check_seat_availability(tenant_id, "student")
        assert result is None

    async def test_central_child_no_allocation_uses_parent_pool(self, engine, mock_repo):
        """Central child without specific allocation — falls back to parent pool."""
        tenant_id = uuid4()
        child2 = uuid4()
        link = MagicMock()
        link.billing_mode = "central"
        link.parent_tenant_id = uuid4()
        link.seat_allocations = None
        mock_repo.get_hierarchy_link.return_value = link

        parent_seat = MagicMock()
        parent_seat.max_count = 20
        mock_repo.get_seat_usage.return_value = parent_seat
        mock_repo.get_central_child_ids.return_value = [tenant_id, child2]
        # Called 3 times: once for initial count, twice in the child loop
        mock_repo.count_active_students.side_effect = [8, 8, 12]

        result = await engine._check_seat_availability(tenant_id, "student")
        assert result is not None
        assert "Parent pool" in result.reason

    async def test_no_seat_usage_record_allows(self, engine, mock_repo):
        """Standalone tenant with no SeatUsage record — passes."""
        mock_repo.get_hierarchy_link.return_value = None
        mock_repo.get_seat_usage.return_value = None

        result = await engine._check_seat_availability(uuid4(), "student")
        assert result is None


class TestAllowDenyHelpers:
    def test_allow(self):
        r = Allow()
        assert r.allowed is True
        assert r.reason is None

    def test_deny(self):
        r = Deny("nope")
        assert r.allowed is False
        assert r.reason == "nope"
