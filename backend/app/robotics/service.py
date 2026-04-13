"""Phase-0 robotics service with in-memory storage contracts."""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select

from app.config import settings
from app.curriculum.models import Lab
from app.dependencies import CurrentIdentity, TenantContext
from app.lesson_content.models import Lesson, LessonResource
from app.robotics.adapters.manifests import CAPABILITY_MANIFESTS
from app.robotics.schemas import (
    RoboticsAttemptCreate,
    RoboticsAttemptResponse,
    RoboticsCapabilityManifest,
    RoboticsCompileJobResponse,
    RoboticsCompileRequest,
    RoboticsEventRecord,
    RoboticsProjectCreate,
    RoboticsProjectResponse,
    RoboticsProjectUpdate,
    RoboticsProjectSource,
    RoboticsTemplateResolveResponse,
)


def _coerce_mode(value: object) -> str:
    as_text = str(value or "blocks")
    return as_text if as_text in {"blocks", "hybrid", "python", "cpp"} else "blocks"


class RoboticsService:
    """Stores robotics data in-process until DB models are added."""

    _projects: dict[UUID, RoboticsProjectResponse] = {}
    _attempts: dict[UUID, list[RoboticsAttemptResponse]] = {}
    _events: list[RoboticsEventRecord] = []
    _compile_jobs: dict[UUID, RoboticsCompileJobResponse] = {}

    def __init__(self, _session):
        self._session = _session

    def list_manifests(self) -> list[RoboticsCapabilityManifest]:
        return [RoboticsCapabilityManifest.model_validate(item) for item in CAPABILITY_MANIFESTS]

    def create_project(
        self,
        *,
        data: RoboticsProjectCreate,
        tenant: TenantContext,
        identity: CurrentIdentity,
    ) -> RoboticsProjectResponse:
        now = datetime.now(timezone.utc)
        project = RoboticsProjectResponse(
            id=uuid4(),
            tenant_id=tenant.tenant_id,
            student_id=identity.id,
            title=data.title,
            robot_vendor=data.robot_vendor,
            robot_type=data.robot_type,
            mode=data.mode,
            editor_mode=data.editor_mode,
            project_source=data.project_source,
            schema_version=data.schema_version,
            source=data.source,
            world_scene=data.world_scene,
            runtime_settings=data.runtime_settings,
            metadata=data.metadata_,
            revision=1,
            created_at=now,
            updated_at=now,
        )
        self._projects[project.id] = project
        return project

    def list_projects(
        self,
        *,
        tenant: TenantContext,
        student_id: UUID | None = None,
        limit: int = 100,
        skip: int = 0,
    ) -> list[RoboticsProjectResponse]:
        rows = [
            item
            for item in self._projects.values()
            if item.tenant_id == tenant.tenant_id
            and (student_id is None or item.student_id == student_id)
        ]
        rows.sort(key=lambda item: item.updated_at, reverse=True)
        return rows[skip : skip + limit]

    def get_project(self, *, project_id: UUID, tenant: TenantContext) -> RoboticsProjectResponse | None:
        project = self._projects.get(project_id)
        if project is None or project.tenant_id != tenant.tenant_id:
            return None
        return project

    def update_project(
        self,
        *,
        project_id: UUID,
        data: RoboticsProjectUpdate,
        tenant: TenantContext,
    ) -> RoboticsProjectResponse | None:
        project = self.get_project(project_id=project_id, tenant=tenant)
        if project is None:
            return None

        patch = data.model_dump(exclude_unset=True, by_alias=True)
        merged = project.model_dump(by_alias=True)
        merged.update(patch)
        merged["revision"] = project.revision + 1
        merged["updated_at"] = datetime.now(timezone.utc)

        next_project = RoboticsProjectResponse.model_validate(merged)
        self._projects[project_id] = next_project
        return next_project

    def create_attempt(
        self,
        *,
        project_id: UUID,
        data: RoboticsAttemptCreate,
        tenant: TenantContext,
    ) -> RoboticsAttemptResponse | None:
        project = self.get_project(project_id=project_id, tenant=tenant)
        if project is None:
            return None
        now = datetime.now(timezone.utc)
        attempt = RoboticsAttemptResponse(
            id=uuid4(),
            project_id=project_id,
            tenant_id=tenant.tenant_id,
            mission_id=data.mission_id,
            run_mode=data.run_mode,
            status="completed",
            score=float(data.telemetry.get("score")) if "score" in data.telemetry else None,
            telemetry=data.telemetry,
            created_at=now,
            completed_at=now,
        )
        self._attempts.setdefault(project_id, []).append(attempt)
        return attempt

    def list_attempts(self, *, project_id: UUID, tenant: TenantContext) -> list[RoboticsAttemptResponse]:
        project = self.get_project(project_id=project_id, tenant=tenant)
        if project is None:
            return []
        rows = self._attempts.get(project_id, [])
        return sorted(rows, key=lambda item: item.created_at, reverse=True)

    def ingest_events(self, *, tenant: TenantContext, events: list[RoboticsEventRecord]) -> int:
        tenant_events = [
            item.model_copy(update={"payload": {**item.payload, "tenant_id": str(tenant.tenant_id)}})
            for item in events
        ]
        self._events.extend(tenant_events)
        return len(tenant_events)

    async def create_compile_job(
        self,
        *,
        data: RoboticsCompileRequest,
        tenant: TenantContext,
        identity: CurrentIdentity,
    ) -> RoboticsCompileJobResponse:
        now = datetime.now(timezone.utc)
        job = RoboticsCompileJobResponse(
            id=uuid4(),
            tenant_id=tenant.tenant_id,
            requested_by=identity.id,
            robot_vendor=data.robot_vendor,
            robot_type=data.robot_type,
            language=data.language,
            target=data.target,
            status="running",
            created_at=now,
            updated_at=now,
        )
        self._compile_jobs[job.id] = job

        compiler_url = (settings.ROBOTICS_COMPILER_URL or "").strip()
        if settings.ROBOTICS_LOCAL_TOOLCHAIN_ENABLED and data.robot_vendor == "vex" and data.language == "cpp":
            local_result = self._run_local_pros_compile(job=job, data=data)
            if local_result.status == "completed":
                return local_result
            if not settings.ROBOTICS_LOCAL_TOOLCHAIN_FAIL_OPEN:
                return local_result
            job = local_result

        if compiler_url:
            remote_result = await self._run_remote_compile(job=job, data=data, compiler_url=compiler_url)
            if remote_result.status == "completed":
                return remote_result
            if settings.ROBOTICS_LOCAL_TOOLCHAIN_FAIL_OPEN:
                return self._complete_local_export(job=remote_result, source_code=data.source_code)
            return remote_result

        return self._complete_local_export(job=job, source_code=data.source_code)

    def get_compile_job(self, *, job_id: UUID, tenant: TenantContext) -> RoboticsCompileJobResponse | None:
        job = self._compile_jobs.get(job_id)
        if job is None or job.tenant_id != tenant.tenant_id:
            return None
        return job

    def _complete_local_export(self, *, job: RoboticsCompileJobResponse, source_code: str) -> RoboticsCompileJobResponse:
        file_ext = "py" if job.language == "python" else "cpp"
        artifact_name = f"{job.robot_vendor}_{job.robot_type}_{job.target}.{file_ext}"
        encoded = base64.b64encode(source_code.encode("utf-8")).decode("utf-8")
        completed = job.model_copy(
            update={
                "status": "completed",
                "provider": "local_export",
                "artifact_name": artifact_name,
                "artifact_content_type": "text/plain",
                "artifact_content_base64": encoded,
                "diagnostics": ["Compiled via local export fallback (source artifact only)."],
                "updated_at": datetime.now(timezone.utc),
            }
        )
        self._compile_jobs[job.id] = completed
        return completed

    async def _run_remote_compile(
        self,
        *,
        job: RoboticsCompileJobResponse,
        data: RoboticsCompileRequest,
        compiler_url: str,
    ) -> RoboticsCompileJobResponse:
        token = (settings.ROBOTICS_COMPILER_TOKEN or "").strip()
        timeout = max(5, int(settings.ROBOTICS_COMPILER_TIMEOUT_SECONDS))
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        payload = {
            "vendor": data.robot_vendor,
            "robot_type": data.robot_type,
            "language": data.language,
            "target": data.target,
            "source_code": data.source_code,
        }
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(compiler_url, json=payload, headers=headers)
                response.raise_for_status()
            parsed = response.json()
            if not isinstance(parsed, dict):
                raise ValueError("Compiler response must be a JSON object")
            artifact_b64 = parsed.get("artifact_content_base64")
            if not isinstance(artifact_b64, str) or not artifact_b64:
                raise ValueError("Compiler response missing artifact_content_base64")
            completed = job.model_copy(
                update={
                    "status": "completed",
                    "provider": str(parsed.get("provider") or "remote_compiler"),
                    "artifact_name": str(parsed.get("artifact_name") or f"robotics_{job.id}.bin"),
                    "artifact_content_type": str(
                        parsed.get("artifact_content_type") or "application/octet-stream"
                    ),
                    "artifact_content_base64": artifact_b64,
                    "diagnostics": [str(item) for item in (parsed.get("diagnostics") or [])],
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self._compile_jobs[job.id] = completed
            return completed
        except Exception as exc:
            failed = job.model_copy(
                update={
                    "status": "failed",
                    "provider": "remote_compiler",
                    "diagnostics": [f"Remote compile failed: {exc}"],
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self._compile_jobs[job.id] = failed
            return failed

    def _run_local_pros_compile(
        self,
        *,
        job: RoboticsCompileJobResponse,
        data: RoboticsCompileRequest,
    ) -> RoboticsCompileJobResponse:
        resolved_pros = self._resolve_pros_binary()
        if not resolved_pros:
            failed = job.model_copy(
                update={
                    "status": "failed",
                    "provider": "local_pros",
                    "diagnostics": ["PROS CLI not found. Set ROBOTICS_PROS_BIN or install pros-cli."],
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self._compile_jobs[job.id] = failed
            return failed

        try:
            with tempfile.TemporaryDirectory(prefix="robotics_pros_") as tmpdir:
                project_dir = Path(tmpdir)
                create_cmd = [resolved_pros, "conductor", "new-project", str(project_dir), "v5", "--no-default-libs"]
                create_proc = subprocess.run(
                    create_cmd,
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=120,
                    env=self._build_toolchain_env(),
                )
                if create_proc.returncode != 0:
                    raise RuntimeError(
                        "PROS project creation failed: "
                        + (create_proc.stderr.strip() or create_proc.stdout.strip() or "unknown error")
                    )

                src_main = project_dir / "src" / "main.cpp"
                src_main.write_text(data.source_code, encoding="utf-8")

                make_cmd = [resolved_pros, "make", "--project", str(project_dir)]
                make_proc = subprocess.run(
                    make_cmd,
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=180,
                    env=self._build_toolchain_env(),
                )
                if make_proc.returncode != 0:
                    raise RuntimeError(
                        "PROS make failed: "
                        + (make_proc.stderr.strip() or make_proc.stdout.strip() or "unknown error")
                    )

                artifact = project_dir / "bin" / "hot.package.bin"
                if not artifact.exists():
                    artifact = project_dir / "bin" / "cold.package.bin"
                if not artifact.exists():
                    raise RuntimeError("PROS build finished but no package artifact was found in bin/.")

                encoded = base64.b64encode(artifact.read_bytes()).decode("utf-8")
                completed = job.model_copy(
                    update={
                        "status": "completed",
                        "provider": "local_pros",
                        "artifact_name": f"{data.robot_vendor}_{data.robot_type}_{data.target}.bin",
                        "artifact_content_type": "application/octet-stream",
                        "artifact_content_base64": encoded,
                        "diagnostics": ["Compiled using local PROS toolchain."],
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                self._compile_jobs[job.id] = completed
                return completed
        except Exception as exc:
            failed = job.model_copy(
                update={
                    "status": "failed",
                    "provider": "local_pros",
                    "diagnostics": [f"Local PROS compile failed: {exc}"],
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self._compile_jobs[job.id] = failed
            return failed

    @staticmethod
    def _resolve_pros_binary() -> str | None:
        configured = (settings.ROBOTICS_PROS_BIN or "").strip()
        if configured:
            direct = shutil.which(configured)
            if direct:
                return direct
            if Path(configured).exists():
                return configured
        home_python_bins = sorted(Path.home().glob("Library/Python/*/bin/pros"), reverse=True)
        for candidate in home_python_bins:
            if candidate.exists():
                return str(candidate)
        return shutil.which("pros")

    @staticmethod
    def _resolve_arm_gcc_bin_dir() -> str | None:
        configured = (settings.ROBOTICS_ARM_GCC_BIN_DIR or "").strip()
        if configured and Path(configured).exists():
            return configured
        xpack_bins = sorted(
            Path.home().glob("Library/xPacks/@xpack-dev-tools/arm-none-eabi-gcc/*/.content/bin"),
            reverse=True,
        )
        for candidate in xpack_bins:
            if candidate.exists():
                return str(candidate)
        return None

    @classmethod
    def _build_toolchain_env(cls) -> dict[str, str]:
        env = dict(os.environ)
        arm_bin = cls._resolve_arm_gcc_bin_dir()
        if arm_bin:
            env["PATH"] = f"{arm_bin}:{env.get('PATH', '')}"
        return env

    async def resolve_template(
        self,
        *,
        tenant: TenantContext,
        curriculum_lab_id: UUID | None = None,
        lesson_id: UUID | None = None,
    ) -> RoboticsTemplateResolveResponse:
        if curriculum_lab_id is not None:
            row = (
                await self._session.execute(
                    select(Lab).where(
                        Lab.id == curriculum_lab_id,
                        Lab.lab_type.in_(("robotics-lab", "robotics_lab", "robotics_lab_vr")),
                    )
                )
            ).scalar_one_or_none()
            if row is not None:
                config = dict(row.config or {})
                starter_code = dict(row.starter_code or {})
                return RoboticsTemplateResolveResponse(
                    source="curriculum_lab",
                    source_id=row.id,
                    title=row.title,
                    robot_vendor=str(config.get("robot_vendor") or "vex"),
                    robot_type=str(config.get("robot_type") or "vex_vr"),
                    mode=_coerce_mode(config.get("mode")),
                    source_payload=RoboticsProjectSource(
                        blocks_xml=starter_code.get("blocks_xml"),
                        text_code=starter_code.get("text_code"),
                        ir=starter_code.get("ir") or {},
                    ),
                    world_scene=config.get("world_scene") or {},
                    runtime_settings=config.get("runtime_settings") or {},
                    metadata={
                        "template_priority": "curriculum_first",
                        "tenant_id": str(tenant.tenant_id),
                    },
                )

        if lesson_id is not None:
            lesson = (await self._session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
            if lesson is not None and (lesson.owner_type == "stemplitude" or lesson.tenant_id == tenant.tenant_id):
                resource = (
                    await self._session.execute(
                        select(LessonResource)
                        .where(
                            LessonResource.lesson_id == lesson_id,
                            LessonResource.resource_type == "lab",
                        )
                        .order_by(LessonResource.sort_order.asc())
                    )
                ).scalars()
                for item in resource:
                    metadata = dict(item.metadata_ or {})
                    lab_type = str(metadata.get("lab_type") or "").lower()
                    if lab_type not in ("robotics-lab", "robotics_lab", "robotics_lab_vr"):
                        continue
                    starter_code = metadata.get("starter_code") or {}
                    return RoboticsTemplateResolveResponse(
                        source="track_lesson_resource",
                        source_id=item.id,
                        title=item.title,
                        robot_vendor=str(metadata.get("robot_vendor") or "vex"),
                        robot_type=str(metadata.get("robot_type") or "vex_vr"),
                        mode=_coerce_mode(metadata.get("mode")),
                        source_payload=RoboticsProjectSource(
                            blocks_xml=starter_code.get("blocks_xml"),
                            text_code=starter_code.get("text_code"),
                            ir=starter_code.get("ir") or {},
                        ),
                        world_scene=metadata.get("world_scene") or {},
                        runtime_settings=metadata.get("runtime_settings") or {},
                        metadata={
                            "template_priority": "track_secondary",
                            "tenant_id": str(tenant.tenant_id),
                            "lesson_id": str(lesson_id),
                        },
                    )

        return RoboticsTemplateResolveResponse(
            source="default",
            title="Robotics Starter",
            robot_vendor="vex",
            robot_type="vex_vr",
            mode="blocks",
            source_payload=RoboticsProjectSource(
                blocks_xml=None,
                text_code="# Robotics starter template",
                ir={
                    "version": 1,
                    "entrypoint": "main",
                    "nodes": [
                        {
                            "id": "n1",
                            "kind": "move",
                            "direction": "forward",
                            "unit": "distance_cm",
                            "value": 80,
                            "speed_pct": 70,
                        }
                    ],
                },
            ),
            world_scene={},
            runtime_settings={"tick_ms": 200, "deterministic_replay": True},
            metadata={"template_priority": "default"},
        )

