"""
Community feed endpoints.

GET  /api/community/posts           ?type=post|announcement|notice&page
POST /api/community/posts           JWT(student|admin)
DELETE /api/community/posts/{id}    JWT (own or admin)
POST /api/community/posts/{id}/like JWT (toggle)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.community_post import CommunityPost, PostLike
from app.models.user import User

router = APIRouter(prefix="/api/community", tags=["community"])

_PAGE_SIZE = 20


class PostIn(BaseModel):
    content: str
    image_url: str | None = None
    link_url: str | None = None
    post_type: str = "post"


def _serialize(post: CommunityPost, like_count: int, liked_by_me: bool, author_name: str) -> dict:
    return {
        "id": post.id,
        "author_id": post.author_id,
        "author_name": author_name,
        "author_role": post.author_role,
        "content": post.content,
        "image_url": post.image_url,
        "link_url": post.link_url,
        "post_type": post.post_type,
        "like_count": like_count,
        "liked_by_me": liked_by_me,
        "created_at": post.created_at,
    }


@router.get("/posts")
async def list_posts(
    type: str | None = Query(None),
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * _PAGE_SIZE

    q = select(CommunityPost).where(CommunityPost.is_active == True)
    if type in ("post", "announcement", "notice"):
        q = q.where(CommunityPost.post_type == type)
    q = q.order_by(CommunityPost.created_at.desc()).offset(offset).limit(_PAGE_SIZE)

    result = await db.execute(q)
    posts = result.scalars().all()

    if not posts:
        return []

    post_ids = [p.id for p in posts]

    # like counts per post
    like_counts_result = await db.execute(
        select(PostLike.post_id, func.count(PostLike.user_id).label("cnt"))
        .where(PostLike.post_id.in_(post_ids))
        .group_by(PostLike.post_id)
    )
    like_counts = {row.post_id: row.cnt for row in like_counts_result}

    # posts liked by current user
    my_likes_result = await db.execute(
        select(PostLike.post_id).where(
            PostLike.post_id.in_(post_ids),
            PostLike.user_id == current_user.id,
        )
    )
    my_liked = {row.post_id for row in my_likes_result}

    # author names
    author_ids = list({p.author_id for p in posts})
    authors_result = await db.execute(
        select(User.id, User.full_name).where(User.id.in_(author_ids))
    )
    author_names = {row.id: row.full_name for row in authors_result}

    return [
        _serialize(
            p,
            like_counts.get(p.id, 0),
            p.id in my_liked,
            author_names.get(p.author_id, "Unknown"),
        )
        for p in posts
    ]


@router.post("/posts", status_code=status.HTTP_201_CREATED)
async def create_post(
    body: PostIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    # Students can only create regular posts
    if role == "student" and body.post_type != "post":
        raise HTTPException(status_code=403, detail="Students can only create posts, not announcements or notices")

    if body.post_type not in ("post", "announcement", "notice"):
        raise HTTPException(status_code=400, detail="post_type must be post, announcement, or notice")

    post = CommunityPost(
        author_id=current_user.id,
        author_role=role,
        content=body.content,
        image_url=body.image_url,
        link_url=body.link_url,
        post_type=body.post_type,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    return _serialize(post, 0, False, current_user.full_name)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(CommunityPost).where(CommunityPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Already soft-deleted — treat as success (idempotent)
    if not post.is_active:
        return

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if post.author_id != current_user.id and role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")

    post.is_active = False
    await db.commit()


@router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(CommunityPost).where(CommunityPost.id == post_id, CommunityPost.is_active == True))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = await db.execute(
        select(PostLike).where(PostLike.user_id == current_user.id, PostLike.post_id == post_id)
    )
    like = existing.scalar_one_or_none()

    if like:
        await db.execute(
            delete(PostLike).where(PostLike.user_id == current_user.id, PostLike.post_id == post_id)
        )
        liked = False
    else:
        db.add(PostLike(user_id=current_user.id, post_id=post_id))
        liked = True

    await db.commit()

    count_result = await db.execute(
        select(func.count(PostLike.user_id)).where(PostLike.post_id == post_id)
    )
    like_count = count_result.scalar_one()

    return {"liked": liked, "like_count": like_count}
