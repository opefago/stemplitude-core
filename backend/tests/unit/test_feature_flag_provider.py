from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.feature_flags.provider import (
    EvaluationContext,
    InternalFeatureFlagProvider,
    deterministic_bucket,
)


class StubRepo:
    def __init__(self, flag=None, rules=None, targets=None, variants=None):
        self.flag = flag
        self.rules = rules or []
        self.targets = targets or []
        self.variants = variants or []

    async def get_flag_by_key(self, _key: str):
        return self.flag

    async def list_targets(self, _flag_id):
        return self.targets

    async def list_rules(self, _flag_id):
        return self.rules

    async def list_variants(self, _flag_id):
        return self.variants


@pytest.mark.unit
@pytest.mark.asyncio
async def test_missing_flag_defaults_false_without_exception():
    provider = InternalFeatureFlagProvider(db=None)  # type: ignore[arg-type]
    provider.repo = StubRepo(flag=None)
    context = EvaluationContext(
        flag_key="missing_flag",
        user_id=None,
        tenant_id=None,
        traits={},
        stage="dev",
    )

    result = await provider._evaluate_uncached(context)

    assert result.enabled is False
    assert result.decision_source == "missing_flag"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_user_target_overrides_default():
    user_id = uuid4()
    flag = SimpleNamespace(
        id=uuid4(),
        key="robotics_sim_v2",
        status="active",
        stage="all",
        default_enabled=False,
        archived_at=None,
    )
    target = SimpleNamespace(
        target_type="user",
        target_key=str(user_id),
        stage="any",
        enabled=True,
        variant=None,
    )
    provider = InternalFeatureFlagProvider(db=None)  # type: ignore[arg-type]
    provider.repo = StubRepo(flag=flag, targets=[target])
    context = EvaluationContext(
        flag_key=flag.key,
        user_id=user_id,
        tenant_id=None,
        traits={},
        stage="dev",
    )

    result = await provider._evaluate_uncached(context)

    assert result.enabled is True
    assert result.decision_source == "user_target"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_specific_user_override_beats_global_target():
    user_id = uuid4()
    flag = SimpleNamespace(
        id=uuid4(),
        key="platform_feature_flags",
        status="active",
        stage="all",
        default_enabled=False,
        archived_at=None,
    )
    global_on = SimpleNamespace(
        target_type="all",
        target_key="*",
        stage="any",
        enabled=True,
        variant=None,
    )
    user_off = SimpleNamespace(
        target_type="user",
        target_key=str(user_id),
        stage="any",
        enabled=False,
        variant=None,
    )
    provider = InternalFeatureFlagProvider(db=None)  # type: ignore[arg-type]
    provider.repo = StubRepo(flag=flag, targets=[global_on, user_off])
    context = EvaluationContext(
        flag_key=flag.key,
        user_id=user_id,
        tenant_id=None,
        traits={},
        stage="dev",
    )

    result = await provider._evaluate_uncached(context)

    assert result.enabled is False
    assert result.decision_source == "user_target"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rollout_rule_is_deterministic_for_subject():
    user_id = uuid4()
    flag = SimpleNamespace(
        id=uuid4(),
        key="rollout_flag",
        status="active",
        stage="all",
        default_enabled=False,
        archived_at=None,
    )
    rule = SimpleNamespace(
        enabled=True,
        conditions_json=[],
        match_operator="all",
        rollout_percentage=50,
        variant=None,
    )
    provider = InternalFeatureFlagProvider(db=None)  # type: ignore[arg-type]
    provider.repo = StubRepo(flag=flag, rules=[rule], targets=[])
    context = EvaluationContext(
        flag_key=flag.key,
        user_id=user_id,
        tenant_id=None,
        traits={},
        stage="dev",
    )

    first = await provider._evaluate_uncached(context)
    second = await provider._evaluate_uncached(context)

    assert first.enabled == second.enabled
    assert deterministic_bucket(f"{flag.key}:{context.subject_key}:{context.stage}", 100) < 100
