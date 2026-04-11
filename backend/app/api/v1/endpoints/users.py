from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
import base64
import io
import uuid

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.student import StudentProfile
from app.models.user import User, TeacherProfile
from app.services.storage_service import storage_service

router = APIRouter()


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    date_of_birth: Optional[str] = None
    # Student specific
    education_level: Optional[str] = None
    grade_level: Optional[str] = None
    school_name: Optional[str] = None
    learning_style: Optional[str] = None
    # Teacher specific
    specialization: Optional[str] = None
    years_of_experience: Optional[int] = None


from app.services.gamification import update_student_streak


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    """Get current user info and hydrate gamification stats."""

    gamification_stats = None
    profile_info = {}

    # Process Student Gamification (Streaks & XP Returns)
    if current_user.role == "student" and current_user.student_profile:
        student_profile = current_user.student_profile
        
        if student_profile:
            streak_updated = update_student_streak(db, student_profile)
            if streak_updated:
                await db.commit()

            gamification_stats = {
                "xp": student_profile.xp,
                "level": student_profile.level,
                "current_streak": student_profile.current_streak,
                "longest_streak": student_profile.longest_streak,
                "badges": student_profile.badges,
            }
            profile_info = {
                "education_level": student_profile.education_level,
                "grade_level": student_profile.grade_level,
                "school_name": student_profile.school_name,
                "learning_style": student_profile.learning_style,
            }

    # Process Teacher Gamification
    elif current_user.role == "teacher" and current_user.teacher_profile:
        teacher_profile = current_user.teacher_profile
        
        if teacher_profile:
            gamification_stats = {
                "impact_score": teacher_profile.impact_score,
                "badges": teacher_profile.badges,
            }
            profile_info = {
                "specialization": teacher_profile.specialization,
                "years_of_experience": teacher_profile.years_of_experience,
            }

    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "avatar_url": storage_service.resolve_url(current_user.avatar_url),
        "bio": current_user.bio,
        "phone_number": current_user.phone_number,
        "state": current_user.state,
        "city": current_user.city,
        "date_of_birth": current_user.date_of_birth.isoformat()
        if current_user.date_of_birth
        else None,
        "is_verified": current_user.email_verified_at is not None,
        "created_at": current_user.created_at.isoformat()
        if current_user.created_at
        else None,
        "gamification": gamification_stats,
        "profile": profile_info,
    }


@router.put("/me")
async def update_current_user(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Update current user profile and linked Student/Teacher profiles"""
    # Update only provided fields for User model
    update_dict = update_data.model_dump(exclude_unset=True)

    # Intercept avatar_url if it's a base64 string
    if update_dict.get("avatar_url") and update_dict["avatar_url"].startswith("data:image"):
        try:
            header, encoded = update_dict["avatar_url"].split(",", 1)
            ext = "png"
            if "jpeg" in header or "jpg" in header:
                ext = "jpg"
                
            image_data = base64.b64decode(encoded)
            file_obj = io.BytesIO(image_data)
            
            object_name = f"avatars/{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
            
            uploaded_url = storage_service.upload_file(
                file_obj, object_name, content_type=f"image/{ext}"
            )
            
            update_dict["avatar_url"] = uploaded_url
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process avatar image: {e}")

    # Separate User fields from Profile fields
    user_fields = [
        "first_name",
        "last_name",
        "full_name",
        "phone_number",
        "avatar_url",
        "bio",
        "state",
        "city",
        "date_of_birth",
    ]
    student_fields = [
        "education_level",
        "grade_level",
        "school_name",
        "learning_style",
    ]
    teacher_fields = ["specialization", "years_of_experience"]

    for field, value in update_dict.items():
        if field in user_fields and hasattr(current_user, field):
            setattr(current_user, field, value)

    # Automatically update full_name if first_name or last_name changed
    if "first_name" in update_dict or "last_name" in update_dict:
        first = current_user.first_name or ""
        last = current_user.last_name or ""
        current_user.full_name = f"{first} {last}".strip()

    # Sync avatar_url to Student Profile if applicable
    if "avatar_url" in update_dict:
        if current_user.role == "student":
            res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == current_user.id))
            student_profile = res_prof.scalars().first()
            if student_profile:
                student_profile.avatar_url = update_dict["avatar_url"]
        elif current_user.role == "teacher":
            # TeacherProfile doesn't have avatar_url in the model we saw, 
            # but we should check if they need it. For now, sync student.
            pass

    # Update Student Profile fields
    if current_user.role == "student":
        res_prof = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == current_user.id))
        student_profile = res_prof.scalars().first()
        if student_profile:
            for field in student_fields:
                if field in update_dict:
                    setattr(student_profile, field, update_dict[field])

    # Update Teacher Profile fields
    if current_user.role == "teacher":
        res_prof = await db.execute(select(TeacherProfile).filter(TeacherProfile.user_id == current_user.id))
        teacher_profile = res_prof.scalars().first()
        if teacher_profile:
            for field in teacher_fields:
                if field in update_dict:
                    setattr(teacher_profile, field, update_dict[field])

    await db.commit()
    await db.refresh(current_user)

    # Return the full updated user info, identical to what get_me returns
    return await get_current_user_info(current_user, db)
