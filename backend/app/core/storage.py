from dataclasses import dataclass
from app.core.settings import settings
import re
from pathlib import Path
import shutil

@dataclass
class StoredObject:
    bucket: str
    key: str
    public_url: str | None = None   # if you choose public bucket
    s3_url: str | None = None       # s3://bucket/key

def sanitize_filename(filename: str, max_length: int = 80) -> str:
    raw = filename or "file"
    raw = raw.strip()
    if not raw:
        raw = "file"

    raw = raw.encode("ascii", "ignore").decode("ascii")
    name = Path(raw).name
    stem, ext = Path(name).stem, Path(name).suffix

    stem = re.sub(r"\s+", "-", stem)
    stem = re.sub(r"[^A-Za-z0-9._-]", "", stem)
    stem = re.sub(r"-{2,}", "-", stem).strip("-_.")
    if not stem:
        stem = "file"

    ext = re.sub(r"[^A-Za-z0-9.]", "", ext)
    if ext and not ext.startswith("."):
        ext = f".{ext}"

    max_stem_len = max_length - len(ext)
    if max_stem_len < 1:
        max_stem_len = max_length
        ext = ""
    stem = stem[:max_stem_len]

    return f"{stem}{ext}"

def build_s3_document_prefix(tenant_id: str, user_id: str, class_id: str | int, document_id: str) -> str:
    return (
        f"notescape/v1/tenants/{tenant_id}/"
        f"users/{user_id}/classes/{class_id}/documents/{document_id}"
    )

def build_s3_key_original(
    tenant_id: str,
    user_id: str,
    class_id: str | int,
    document_id: str,
    upload_id: str,
    safe_filename: str,
) -> str:
    base = build_s3_document_prefix(tenant_id, user_id, class_id, document_id)
    return f"{base}/originals/{upload_id}-{safe_filename}"

def get_s3_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )

def ensure_bucket(s3, bucket: str) -> None:
    from botocore.exceptions import ClientError
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError as e:
        code = (e.response or {}).get("Error", {}).get("Code")
        if code in ("404", "NoSuchBucket", "NotFound"):
            if settings.s3_region and settings.s3_region != "us-east-1":
                s3.create_bucket(
                    Bucket=bucket,
                    CreateBucketConfiguration={"LocationConstraint": settings.s3_region},
                )
            else:
                s3.create_bucket(Bucket=bucket)
        else:
            raise

def put_object(fileobj, key: str, content_type: str | None):
    # If S3 is not configured, write locally
    if not settings.s3_endpoint_url:
        print(f"Writing object to local storage: {key}")
        full_path = Path(settings.upload_root) / key
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, "wb") as f:
            if hasattr(fileobj, "read"):
                # it's a file-like object
                shutil.copyfileobj(fileobj, f)
            else:
                f.write(fileobj)
        
        return StoredObject(
            bucket="local", 
            key=key, 
            public_url=f"/api/uploads/{key}", # Hypothetical
            s3_url=f"file://{full_path}"
        )

    s3 = get_s3_client()
    bucket = settings.s3_bucket
    ensure_bucket(s3, bucket)
    extra = {}
    if content_type:
        extra["ContentType"] = content_type

    s3.upload_fileobj(fileobj, bucket, key, ExtraArgs=extra)

    # If bucket is public, you can build a direct URL:
    public_url = None
    if settings.s3_endpoint_url:
        public_url = f"{settings.s3_endpoint_url.rstrip('/')}/{bucket}/{key}"

    return StoredObject(bucket=bucket, key=key, public_url=public_url, s3_url=f"s3://{bucket}/{key}")

def delete_object(key: str):
    # Local fallback
    if not settings.s3_endpoint_url:
        full_path = Path(settings.upload_root) / key
        if full_path.exists():
            full_path.unlink()
        return

    s3 = get_s3_client()
    s3.delete_object(Bucket=settings.s3_bucket, Key=key)

def delete_prefix(prefix: str):
    # Local fallback
    if not settings.s3_endpoint_url:
        full_path = Path(settings.upload_root) / prefix
        # Check if it's a directory or matches files
        if full_path.exists() and full_path.is_dir():
            shutil.rmtree(full_path, ignore_errors=True)
        return

    s3 = get_s3_client()
    bucket = settings.s3_bucket
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        contents = page.get("Contents") or []
        if not contents:
            continue
        objects = [{"Key": obj["Key"]} for obj in contents]
        s3.delete_objects(Bucket=bucket, Delete={"Objects": objects})

def presign_get_url(key: str, expires_seconds: int = 3600) -> str:
    # Local fallback
    if not settings.s3_endpoint_url:
        return f"/api/uploads/{key}" 

    s3 = get_s3_client()
    return s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_seconds,
    )

def get_object_bytes(key: str) -> bytes:
    # Check if key is local path?
    if not key.startswith("notescape/") or not settings.s3_endpoint_url:
        # assume local path
        p = Path(key)
        if p.exists():
            return p.read_bytes()
        # If not absolute, try relative to upload root
        p2 = Path(settings.upload_root) / key
        print(f"Checking local path: {p2} (exists: {p2.exists()})")
        if p2.exists():
            return p2.read_bytes()

    if not settings.s3_endpoint_url:
         raise ValueError(f"File not found locally and S3 not configured: {key}")

    print(f"Falling back to S3 for key: {key}")
    # Fallback to S3
    s3 = get_s3_client()
    resp = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return resp["Body"].read()

def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
    # Local fallback
    if not settings.s3_endpoint_url:
        full_path = Path(settings.upload_root) / key
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        return

    s3 = get_s3_client()
    ensure_bucket(s3, settings.s3_bucket)
    s3.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
