import logging
from uuid import UUID

import boto3
from botocore.exceptions import ClientError
from botocore.config import Config as BotoConfig

from app.config import settings

logger = logging.getLogger(__name__)

_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _s3_client


def tenant_project_key(tenant_id: UUID, student_id: UUID, project_id: UUID, filename: str) -> str:
    return f"tenants/{tenant_id}/students/{student_id}/projects/{project_id}/{filename}"


def tenant_asset_key(tenant_id: UUID, owner_id: UUID, asset_id: UUID, filename: str) -> str:
    return f"tenants/{tenant_id}/students/{owner_id}/assets/{asset_id}/{filename}"


def global_asset_key(asset_id: UUID, filename: str) -> str:
    return f"global/assets/{asset_id}/{filename}"


def tenant_session_recording_key(
    tenant_id: UUID,
    session_id: UUID,
    recording_id: UUID,
    filename: str,
) -> str:
    return f"tenants/{tenant_id}/recordings/{session_id}/{recording_id}/{filename}"


def thumbnail_key_for(blob_key: str) -> str:
    """Derive a thumbnail S3 key from the original blob key."""
    parts = blob_key.rsplit("/", 1)
    if len(parts) == 2:
        return f"{parts[0]}/thumb_{parts[1]}.png"
    return f"thumbnails/{blob_key}.png"


def download_file(key: str) -> bytes:
    logger.debug("S3 download key=%s bucket=%s", key, settings.S3_BUCKET_NAME)
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
        return response["Body"].read()
    except Exception:
        logger.error("S3 download failed key=%s", key, exc_info=True)
        raise


def upload_file(key: str, file_data: bytes, content_type: str) -> str:
    logger.debug("S3 upload key=%s size=%d type=%s", key, len(file_data), content_type)
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=file_data,
            ContentType=content_type,
        )
    except Exception:
        logger.error("S3 upload failed key=%s", key, exc_info=True)
        raise
    return key


def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
        ExpiresIn=expires_in,
    )


def delete_file(key: str) -> None:
    logger.debug("S3 delete key=%s", key)
    client = get_s3_client()
    try:
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except Exception:
        logger.error("S3 delete failed key=%s", key, exc_info=True)
        raise


def delete_objects_batch(keys: list[str]) -> int:
    """Delete up to 1000 keys per S3 request. Returns count reported as deleted."""
    if not keys:
        return 0
    client = get_s3_client()
    total = 0
    for i in range(0, len(keys), 1000):
        batch = keys[i : i + 1000]
        resp = client.delete_objects(
            Bucket=settings.S3_BUCKET_NAME,
            Delete={"Objects": [{"Key": k} for k in batch], "Quiet": False},
        )
        total += len(resp.get("Deleted", []) or [])
        for err in resp.get("Errors", []) or []:
            logger.warning(
                "S3 delete_objects failed key=%s code=%s message=%s",
                err.get("Key"),
                err.get("Code"),
                err.get("Message"),
            )
    return total


def iter_object_keys(prefix: str):
    """Yield every object key under ``prefix`` (paginated list_objects_v2)."""
    client = get_s3_client()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.S3_BUCKET_NAME, Prefix=prefix):
        for obj in page.get("Contents", []) or []:
            key = obj.get("Key")
            if key:
                yield key


def list_objects(
    prefix: str = "",
    *,
    delimiter: str | None = None,
    max_keys: int = 100,
    continuation_token: str | None = None,
) -> dict:
    """List objects and common prefixes for a given key prefix."""
    client = get_s3_client()
    params: dict[str, object] = {
        "Bucket": settings.S3_BUCKET_NAME,
        "Prefix": prefix,
        "MaxKeys": max(1, min(max_keys, 1000)),
    }
    if delimiter:
        params["Delimiter"] = delimiter
    if continuation_token:
        params["ContinuationToken"] = continuation_token
    return client.list_objects_v2(**params)


def head_file(key: str) -> dict | None:
    """Return object metadata for a key; None when key is missing."""
    client = get_s3_client()
    try:
        return client.head_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def search_objects_contains(
    needle: str,
    *,
    prefix: str = "",
    max_results: int = 100,
    scan_limit: int = 5000,
) -> list[dict]:
    """Search object keys containing `needle` under `prefix`."""
    client = get_s3_client()
    paginator = client.get_paginator("list_objects_v2")
    found: list[dict] = []
    scanned = 0
    lowered = needle.lower()

    for page in paginator.paginate(Bucket=settings.S3_BUCKET_NAME, Prefix=prefix):
        for obj in page.get("Contents", []):
            scanned += 1
            if scanned > scan_limit:
                return found
            key = obj.get("Key", "")
            if lowered in key.lower():
                found.append(obj)
                if len(found) >= max_results:
                    return found
    return found


def generate_presigned_download_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL to download an object."""
    return generate_presigned_url(key=key, expires_in=expires_in)
