from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.parse import quote, unquote
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.config import settings

from .models import FeatureFlagMetricBucket
from .repository import FeatureFlagRepository


def deterministic_bucket(seed: str, modulo: int = 100) -> int:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % modulo


def _context_hash(traits: dict[str, Any]) -> str:
    payload = json.dumps(traits, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _matches_condition(traits: dict[str, Any], condition: dict[str, Any]) -> bool:
    attribute = str(condition.get("attribute", "")).strip()
    op = str(condition.get("op", "eq"))
    value = condition.get("value")
    actual = traits.get(attribute)

    if op == "eq":
        return actual == value
    if op == "neq":
        return actual != value
    if op == "contains":
        return actual is not None and str(value) in str(actual)
    if op == "startswith":
        return actual is not None and str(actual).startswith(str(value))
    if op == "endswith":
        return actual is not None and str(actual).endswith(str(value))
    if op == "in":
        if isinstance(value, list):
            return actual in value
        return False
    return False


@dataclass(slots=True)
class EvaluationContext:
    flag_key: str
    stage: str
    user_id: UUID | None
    tenant_id: UUID | None
    traits: dict[str, Any]

    @property
    def subject_type(self) -> str:
        if self.user_id:
            return "user"
        if self.tenant_id:
            return "tenant"
        return "anonymous"

    @property
    def subject_key(self) -> str:
        if self.user_id:
            return str(self.user_id)
        if self.tenant_id:
            return str(self.tenant_id)
        return "anonymous"


@dataclass(slots=True)
class EvaluationResult:
    key: str
    enabled: bool
    variant: str | None
    decision_source: str
    cache_hit: bool = False
    reason: str | None = None


class FeatureFlagProvider(Protocol):
    async def evaluate(self, context: EvaluationContext) -> EvaluationResult: ...
    async def invalidate(self, flag_key: str | None = None) -> None: ...


class InternalFeatureFlagProvider:
    _l1_cache: dict[str, tuple[float, EvaluationResult]] = {}

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = FeatureFlagRepository(db)

    async def evaluate(self, context: EvaluationContext, *, record_metrics: bool = True) -> EvaluationResult:
        redis = await get_redis()
        cache_key = self._cache_key(context)
        now = time.time()
        l1_ttl = max(1, int(settings.FEATURE_FLAGS_L1_TTL_SECONDS))
        cached_l1 = self._l1_cache.get(cache_key)
        if cached_l1 and cached_l1[0] > now:
            result = cached_l1[1]
            result.cache_hit = True
            if record_metrics:
                await self._record_evaluation(context, result)
            return result

        cached = await redis.get(cache_key)
        if cached:
            payload = json.loads(cached)
            result = EvaluationResult(
                key=context.flag_key,
                enabled=bool(payload.get("enabled", False)),
                variant=payload.get("variant"),
                decision_source=str(payload.get("decision_source", "cache")),
                cache_hit=True,
                reason=payload.get("reason"),
            )
            self._l1_cache[cache_key] = (now + l1_ttl, result)
            if record_metrics:
                await self._record_evaluation(context, result)
            return result

        result = await self._evaluate_uncached(context)
        await redis.setex(
            cache_key,
            max(1, int(settings.FEATURE_FLAGS_L2_TTL_SECONDS)),
            json.dumps(asdict(result)),
        )
        self._l1_cache[cache_key] = (now + l1_ttl, result)
        if record_metrics:
            await self._record_evaluation(context, result)
        return result

    async def _evaluate_uncached(self, context: EvaluationContext) -> EvaluationResult:
        flag = await self.repo.get_flag_by_key(context.flag_key)
        if not flag or flag.archived_at is not None:
            return EvaluationResult(
                key=context.flag_key,
                enabled=False,
                variant=None,
                decision_source="missing_flag",
                reason="Flag is not registered",
            )

        if flag.status in {"paused", "archived"}:
            return EvaluationResult(
                key=context.flag_key,
                enabled=False,
                variant=None,
                decision_source="global_off",
                reason=f"Flag status is {flag.status}",
            )

        if flag.stage == "production" and context.stage != "production":
            return EvaluationResult(
                key=context.flag_key,
                enabled=False,
                variant=None,
                decision_source="stage_mismatch",
                reason="Production-only flag in non-production stage",
            )
        if flag.stage == "dev" and context.stage == "production":
            return EvaluationResult(
                key=context.flag_key,
                enabled=False,
                variant=None,
                decision_source="stage_mismatch",
                reason="Dev-only flag in production stage",
            )

        targets = await self.repo.list_targets(flag.id)
        target_result = self._match_targets(context, targets)
        if target_result:
            enabled, variant, source = target_result
            return EvaluationResult(
                key=context.flag_key,
                enabled=enabled,
                variant=variant,
                decision_source=source,
            )

        rules = await self.repo.list_rules(flag.id)
        variants = await self.repo.list_variants(flag.id)
        for rule in rules:
            if not rule.enabled:
                continue
            conditions = rule.conditions_json or []
            if not conditions:
                matched = True
            else:
                hits = [_matches_condition(context.traits, condition) for condition in conditions]
                matched = all(hits) if rule.match_operator == "all" else any(hits)
            if conditions and not matched:
                continue
            if rule.rollout_percentage is not None:
                bucket = deterministic_bucket(
                    f"{context.flag_key}:{context.subject_key}:{context.stage}",
                    100,
                )
                if bucket >= int(rule.rollout_percentage):
                    continue
            variant = rule.variant
            if not variant and variants:
                variant = self._pick_variant(context, variants)
            return EvaluationResult(
                key=context.flag_key,
                enabled=True,
                variant=variant,
                decision_source="rule_match",
            )

        fallback_variant = self._pick_variant(context, variants) if flag.default_enabled and variants else None
        return EvaluationResult(
            key=context.flag_key,
            enabled=bool(flag.default_enabled),
            variant=fallback_variant,
            decision_source="default",
        )

    @staticmethod
    def _match_targets(
        context: EvaluationContext,
        targets: list[Any],
    ) -> tuple[bool, str | None, str] | None:
        stage = context.stage
        stage_allowed = {"any", stage}
        matched_user: tuple[bool, str | None, str] | None = None
        matched_tenant: tuple[bool, str | None, str] | None = None
        matched_all: tuple[bool, str | None, str] | None = None

        for target in targets:
            if target.stage not in stage_allowed:
                continue
            if target.target_type == "user" and context.user_id and target.target_key == str(context.user_id):
                matched_user = (target.enabled, target.variant, "user_target")
                continue
            if target.target_type == "tenant" and context.tenant_id and target.target_key == str(context.tenant_id):
                matched_tenant = (target.enabled, target.variant, "tenant_target")
                continue
            if target.target_type == "all" and target.target_key == "*":
                matched_all = (target.enabled, target.variant, "global_target")

        # Most specific match wins:
        # user override > tenant override > global all
        return matched_user or matched_tenant or matched_all

    @staticmethod
    def _pick_variant(context: EvaluationContext, variants: list[Any]) -> str | None:
        weighted = [(v.key, max(0, int(v.weight))) for v in variants]
        total = sum(weight for _, weight in weighted)
        if total <= 0:
            return None
        bucket = deterministic_bucket(f"{context.flag_key}:{context.subject_key}:variant", total)
        cursor = 0
        for key, weight in weighted:
            cursor += weight
            if bucket < cursor:
                return key
        return weighted[-1][0] if weighted else None

    async def _record_evaluation(self, context: EvaluationContext, result: EvaluationResult) -> None:
        redis = await get_redis()
        now = datetime.now(timezone.utc)
        day_bucket = now.replace(hour=0, minute=0, second=0, microsecond=0)
        dim_key, dim_value = self._dimension(context)
        encoded_dim = quote(dim_value, safe="")
        day_token = day_bucket.strftime("%Y%m%d")
        metric_key = (
            "ff:metricbuf:"
            f"{context.flag_key}:"
            f"{day_token}:"
            f"{dim_key}:"
            f"{encoded_dim}"
        )
        field = "on_count" if result.enabled else "off_count"
        await redis.hincrby(metric_key, field, 1)
        if result.variant:
            await redis.hincrby(metric_key, f"variant::{result.variant}", 1)
        await redis.expire(metric_key, 7 * 24 * 3600)

    async def record_usage(self, context: EvaluationContext) -> None:
        redis = await get_redis()
        now = datetime.now(timezone.utc)
        day_bucket = now.replace(hour=0, minute=0, second=0, microsecond=0)
        dim_key, dim_value = self._dimension(context)
        encoded_dim = quote(dim_value, safe="")
        day_token = day_bucket.strftime("%Y%m%d")
        metric_key = (
            "ff:metricbuf:"
            f"{context.flag_key}:"
            f"{day_token}:"
            f"{dim_key}:"
            f"{encoded_dim}"
        )
        await redis.hincrby(metric_key, "usage_count", 1)
        await redis.expire(metric_key, 7 * 24 * 3600)

    @staticmethod
    def _dimension(context: EvaluationContext) -> tuple[str, str]:
        region = context.traits.get("region")
        timezone = context.traits.get("timezone")
        if region:
            return "region", str(region)
        if timezone:
            return "timezone", str(timezone)
        if context.tenant_id:
            return "tenant", str(context.tenant_id)
        return "all", "all"

    @staticmethod
    def _cache_key(context: EvaluationContext) -> str:
        traits_hash = _context_hash(context.traits)
        return (
            "ff:v1:"
            f"{context.stage}:{context.flag_key}:"
            f"{context.subject_type}:{context.subject_key}:"
            f"{context.tenant_id}:{traits_hash}"
        )

    async def invalidate(self, flag_key: str | None = None) -> None:
        redis = await get_redis()
        if flag_key:
            pattern = f"ff:v1:*:{flag_key}:*"
        else:
            pattern = "ff:v1:*"
        cursor = 0
        while True:
            cursor, keys = await redis.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                await redis.delete(*keys)
            if cursor == 0:
                break
        if flag_key:
            for cache_key in list(self._l1_cache.keys()):
                if f":{flag_key}:" in cache_key:
                    self._l1_cache.pop(cache_key, None)
        else:
            self._l1_cache.clear()

    async def flush_metric_buffers(self, flag_key: str | None = None) -> int:
        redis = await get_redis()
        pattern = f"ff:metricbuf:{flag_key}:*" if flag_key else "ff:metricbuf:*"
        flushed = 0
        async for key in redis.scan_iter(match=pattern, count=250):
            parts = key.split(":", 5)
            if len(parts) != 6:
                continue
            _, _, current_flag_key, bucket_token, dim_key, dim_value_encoded = parts
            flag = await self.repo.get_flag_by_key(current_flag_key)
            if not flag:
                await redis.delete(key)
                continue
            values = await redis.hgetall(key)
            if not values:
                continue
            on_count = int(values.get("on_count", 0))
            off_count = int(values.get("off_count", 0))
            usage_count = int(values.get("usage_count", 0))
            variant_counts: dict[str, int] = {}
            for field, val in values.items():
                if field.startswith("variant::"):
                    variant_counts[field.split("::", 1)[1]] = int(val)

            try:
                bucket_start = datetime.strptime(bucket_token, "%Y%m%d").replace(tzinfo=timezone.utc)
            except ValueError:
                await redis.delete(key)
                continue
            dim_value = unquote(dim_value_encoded)
            await self._upsert_metric_bucket(
                flag_id=flag.id,
                bucket_start=bucket_start,
                dimension_key=dim_key,
                dimension_value=dim_value,
                on_count=on_count,
                off_count=off_count,
                usage_count=usage_count,
                variant_counts=variant_counts,
            )
            await redis.delete(key)
            flushed += 1
        if flushed:
            await self.db.flush()
        return flushed

    async def _upsert_metric_bucket(
        self,
        *,
        flag_id: UUID,
        bucket_start: datetime,
        dimension_key: str,
        dimension_value: str,
        on_count: int,
        off_count: int,
        usage_count: int,
        variant_counts: dict[str, int],
    ) -> None:
        stmt = select(FeatureFlagMetricBucket).where(
            FeatureFlagMetricBucket.flag_id == flag_id,
            FeatureFlagMetricBucket.bucket_start == bucket_start,
            FeatureFlagMetricBucket.bucket_granularity == "day",
            FeatureFlagMetricBucket.dimension_key == dimension_key,
            FeatureFlagMetricBucket.dimension_value == dimension_value,
        )
        row = (await self.db.execute(stmt)).scalar_one_or_none()
        if row:
            merged_variants = dict(row.variant_counts or {})
            for key, value in variant_counts.items():
                merged_variants[key] = int(merged_variants.get(key, 0)) + int(value)
            row.on_count = int(row.on_count) + on_count
            row.off_count = int(row.off_count) + off_count
            row.usage_count = int(row.usage_count) + usage_count
            row.variant_counts = merged_variants
            row.updated_at = datetime.now(timezone.utc)
            return
        self.db.add(
            FeatureFlagMetricBucket(
                flag_id=flag_id,
                bucket_start=bucket_start,
                bucket_granularity="day",
                dimension_key=dimension_key,
                dimension_value=dimension_value,
                on_count=on_count,
                off_count=off_count,
                usage_count=usage_count,
                variant_counts=variant_counts,
            )
        )


async def flush_feature_flag_metric_buffers(db: AsyncSession, flag_key: str | None = None) -> int:
    provider = InternalFeatureFlagProvider(db)
    return await provider.flush_metric_buffers(flag_key=flag_key)

