import boto3
from botocore.exceptions import ClientError

from app.config import settings

_client = None


def get_r2_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _client


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to R2 and return the public URL."""
    client = get_r2_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return f"{settings.R2_ENDPOINT}/{settings.R2_BUCKET_NAME}/{key}"


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for a private object."""
    client = get_r2_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.R2_BUCKET_NAME, "Key": key},
        ExpiresIn=expires_in,
    )


def delete_object(key: str) -> None:
    client = get_r2_client()
    client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)


def delete_prefix(prefix: str) -> int:
    """Delete all objects whose key starts with prefix. Returns count deleted."""
    client = get_r2_client()
    deleted = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.R2_BUCKET_NAME, Prefix=prefix):
        objects = page.get("Contents", [])
        if not objects:
            continue
        client.delete_objects(
            Bucket=settings.R2_BUCKET_NAME,
            Delete={"Objects": [{"Key": obj["Key"]} for obj in objects]},
        )
        deleted += len(objects)
    return deleted


def check_connection() -> bool:
    """Verify R2 connection by listing the bucket (head bucket)."""
    try:
        client = get_r2_client()
        client.head_bucket(Bucket=settings.R2_BUCKET_NAME)
        return True
    except ClientError:
        return False
