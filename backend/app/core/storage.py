from dataclasses import dataclass
from app.core.settings import settings

@dataclass
class StoredObject:
    bucket: str
    key: str
    public_url: str | None = None   # if you choose public bucket
    s3_url: str | None = None       # s3://bucket/key

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
            s3.create_bucket(Bucket=bucket)
        else:
            raise

def put_object(fileobj, key: str, content_type: str | None):
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
    s3 = get_s3_client()
    s3.delete_object(Bucket=settings.s3_bucket, Key=key)

def presign_get_url(key: str, expires_seconds: int = 3600) -> str:
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_seconds,
    )

def get_object_bytes(key: str) -> bytes:
    s3 = get_s3_client()
    resp = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return resp["Body"].read()

def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
