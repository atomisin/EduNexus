"""
Materials endpoints
Teachers can add, update, and manage materials
Students can view and access materials shared with them
"""

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Form,
    Query,
)
from typing import List, Optional, Any
from datetime import datetime, timezone
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, any_
from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole, Material, TeacherStudent
from app.services.storage_service import storage_service
from app.services.parsing_service import parsing_service
from fastapi import BackgroundTasks
import os
import tempfile
import logging
import io

logger = logging.getLogger(__name__)

router = APIRouter()


class MaterialCreate(BaseModel):
    title: str
    description: Optional[str] = None
    subject: str
    subject_id: Optional[str] = None
    topic: Optional[str] = None
    education_level: Optional[str] = None
    grade_level: Optional[str] = None
    video_url: Optional[str] = None
    is_public: bool = False
    allowed_students: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class MaterialUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    education_level: Optional[str] = None
    grade_level: Optional[str] = None
    video_url: Optional[str] = None
    is_public: Optional[bool] = None
    allowed_students: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class MaterialResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    file_url: Optional[str]
    video_url: Optional[str]
    file_type: Optional[str]
    file_size: Optional[int]
    subject: str
    subject_id: Optional[str]
    topic: Optional[str]
    education_level: Optional[str]
    uploader_id: str
    uploader_name: str
    is_public: bool
    allowed_students: List[str]
    tags: List[str]
    download_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


async def require_material_uploader(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    """
    Dependency to ensure only authorized users can upload materials.
    - Teachers and Parents: Full access.
    - Professional Students: Can upload for their own courses.
    - Primary/Secondary Students: Forbidden.
    """
    if current_user.role in [UserRole.TEACHER, UserRole.PARENT]:
        return current_user
    
    if str(current_user.role).lower() in ["teacher", "parent"]:
        return current_user
        
    if current_user.role == UserRole.STUDENT or str(current_user.role).lower() == "student":
        from app.models.student import StudentProfile
        result = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == current_user.id))
        profile = result.scalars().first()
        if profile:
            edu_level = (profile.education_level or "").strip().lower()
            if edu_level == "professional":
                return current_user
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Only professional students can upload materials. Your level: {profile.education_level or 'not set'}",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Student profile not found. Please complete your profile setup.",
            )
            
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to upload materials.",
    )


@router.post("/upload", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_material(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    subject: str = Form(...),
    topic: Optional[str] = Form(None),
    education_level: Optional[str] = Form(None),
    grade_level: Optional[str] = Form(None),
    video_url: Optional[str] = Form(None),
    is_public: bool = Form(False),
    allowed_students: Optional[str] = Form(None),  # Comma-separated student IDs
    tags: Optional[str] = Form(None),  # Comma-separated tags
    subject_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Upload a new learning material
    Teachers can upload PDFs, videos, documents, etc.
    """
    logger.info(f"📤 Upload attempt: {title} by {current_user.email} (ID: {current_user.id})")
    
    try:
        if not file and not video_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either a file or a video link must be provided",
            )

        file_extension = None
        file_size = 0
        file_path = None

        if file:
            logger.info(f"Processing file: {file.filename}")
            # Validate file type
            allowed_extensions = {
                ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".mp4", ".mp3", ".txt", ".zip",
            }
            file_extension = (
                "." + file.filename.split(".")[-1].lower() if "." in file.filename else ""
            )

            if file_extension not in allowed_extensions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}",
                )

            # Read file content
            content = await file.read()
            file_size = len(content)
            logger.info(f"File size: {file_size} bytes")

            # Validate file size (max 100MB)
            max_size = 100 * 1024 * 1024  # 100MB
            if file_size > max_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File size exceeds maximum allowed size of 100MB",
                )
                
        # Professional students must specify a course/curriculum context if not provided
        if current_user.role == UserRole.STUDENT and not subject:
             from app.models.student import StudentProfile
             result = await db.execute(select(StudentProfile).filter(StudentProfile.user_id == current_user.id))
             profile = result.scalars().first()
             if profile:
                subject = profile.course_name or "Personal Research"
             else:
                subject = "Personal Research"

        # Parse allowed students
        student_ids = []
        if allowed_students:
            try:
                student_ids = [
                    uuid.UUID(s.strip()) for s in allowed_students.split(",") if s.strip()
                ]

                # Bulk verify all students belong to this teacher
                rel_results = (await db.execute(
                    select(TeacherStudent)
                    .where(
                        TeacherStudent.teacher_id == current_user.id,
                        TeacherStudent.student_id.in_(student_ids)
                    )
                )).scalars().all()
                
                rel_map = {str(r.student_id): r for r in rel_results}
                
                for student_id in student_ids:
                    rel = rel_map.get(str(student_id))
                    if not rel:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Student {student_id} is not in your roster",
                        )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid student ID format in allowed_students",
                )

        # Parse tags
        tag_list = []
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]

        if file:
            # 1. Upload to SeaweedFS
            object_name = f"materials/{current_user.id}/{uuid.uuid4()}{file_extension}"
            logger.info(f"Uploading to storage: {object_name}")
            
            # Use BytesIO with already read content to avoid "seek of closed file"
            file_stream = io.BytesIO(content)
            file_url = storage_service.upload_file(
                file_stream, 
                object_name, 
                content_type=file.content_type
            )
            file_path = file_url
            logger.info(f"✅ File uploaded to storage: {file_path}")

        # Create material record
        logger.info("Saving material record to database...")
        material = Material(
            id=uuid.uuid4(),
            title=title,
            description=description,
            file_url=file_path,
            video_url=video_url,
            file_type=file_extension,
            file_size=file_size,
            subject=subject,
            subject_id=uuid.UUID(subject_id) if subject_id else None,
            topic=topic,
            education_level=education_level,
            grade_level=grade_level,
            uploader_id=current_user.id,
            is_public=False,
            allowed_students=student_ids if current_user.role != UserRole.STUDENT else [],
            tags=tag_list,
            download_count=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        db.add(material)
        await db.commit()
        await db.refresh(material)
        logger.info(f"✅ Material record saved: {material.id}")
        # 3. Trigger document processing in background (Docling + pgvector)
        if file and file_extension in [".pdf", ".docx", ".txt"]:
            # We need a local file for Docling to process
            temp_dir = tempfile.gettempdir()
            temp_file_path = os.path.join(temp_dir, f"process_{material.id}{file_extension}")
            
            logger.info(f"Creating temp file for processing: {temp_file_path}")
            # Use cached content instead of re-reading from file handle
            with open(temp_file_path, "wb") as f:
                f.write(content)
                
            async def process_and_cleanup():
                try:
                    await parsing_service.process_material(material.id, temp_file_path)
                except Exception as e:
                    logger.error(f"❌ Background processing failed for {material.id}: {e}")
                finally:
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
            
            background_tasks.add_task(process_and_cleanup)

        return {
            "message": "Material uploaded successfully",
            "material_id": str(material.id),
            "title": material.title,
            "file_type": material.file_type,
            "file_size": file_size,
            "is_public": material.is_public,
        }
    except Exception as e:
        logger.error(f"❌ Upload failed: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during upload: {str(e)}"
        )


@router.get("/my-materials", response_model=List[MaterialResponse])
async def get_my_materials(
    subject: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Get all materials uploaded by the current teacher
    """
    stmt = select(Material).filter(Material.uploader_id == current_user.id)
 
    if subject:
        stmt = stmt.filter(Material.subject == subject)
 
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.filter(
            or_(
                Material.title.ilike(search_filter),
                Material.description.ilike(search_filter),
                Material.topic.ilike(search_filter)
            )
        )
 
    result_exec = await db.execute(stmt.order_by(Material.created_at.desc()))
    materials = result_exec.scalars().all()

    result = []
    for material in materials:
        result.append(
            MaterialResponse(
                id=str(material.id),
                title=material.title,
                description=material.description,
                file_url=material.file_url,
                file_type=material.file_type,
                file_size=material.file_size,
                subject=material.subject,
                subject_id=str(material.subject_id) if material.subject_id else None,
                topic=material.topic,
                education_level=material.education_level,
                uploader_id=str(material.uploader_id),
                uploader_name=current_user.full_name,
                is_public=material.is_public,
                allowed_students=[str(s) for s in material.allowed_students]
                if material.allowed_students
                else [],
                tags=material.tags or [],
                download_count=material.download_count,
                created_at=material.created_at,
                updated_at=material.updated_at,
            )
        )

    return result


# Student-accessible materials endpoint
@router.get("/available", response_model=List[MaterialResponse])
async def get_available_materials(
    subject: Optional[str] = Query(None),
    education_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get materials available to students:
    - Public materials
    - Materials assigned to this student
    """
    from app.models.student import StudentProfile

    # Get student's profile to find enrolled subjects
    prof_result = await db.execute(
        select(StudentProfile)
        .filter(StudentProfile.user_id == current_user.id)
    )
    student_profile = prof_result.scalars().first()
 
    enrolled_subject_ids = student_profile.enrolled_subjects if student_profile else []

    # Get materials that are either public or assigned to this student
    from sqlalchemy import or_, any_

    stmt = select(Material).filter(
        or_(
            Material.is_public == True,
            current_user.id == any_(Material.allowed_students),
            Material.uploader_id == current_user.id
        )
    )

    # Apply filters
    if subject:
        stmt = stmt.filter(Material.subject == subject)
 
    if education_level:
        stmt = stmt.filter(Material.education_level == education_level)
 
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.filter(Material.title.ilike(search_filter))
 
    res_exec = await db.execute(stmt.order_by(Material.created_at.desc()).limit(100))
    materials = res_exec.scalars().all()
    return [
        MaterialResponse(
            id=str(m.id),
            title=m.title,
            description=m.description,
            file_url=m.file_url,
            video_url=m.video_url,
            file_type=m.file_type,
            file_size=m.file_size,
            subject=m.subject,
            subject_id=str(m.subject_id) if m.subject_id else None,
            topic=m.topic,
            education_level=m.education_level,
            uploader_id=str(m.uploader_id),
            uploader_name=m.uploader.full_name or m.uploader.username if m.uploader else "Teacher",
            is_public=m.is_public,
            allowed_students=[str(s) for s in m.allowed_students] if m.allowed_students else [],
            tags=m.tags or [],
            download_count=m.download_count,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in materials
    ]



@router.get("/all", response_model=List[MaterialResponse])
async def get_all_materials(
    subject: Optional[str] = Query(None),
    education_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Get all materials accessible to teachers
    - Teachers see public materials and their own materials
    Note: Students do NOT have direct access to materials, only through RAG
    """
    # Teachers see public materials and their own
    stmt = (
        select(Material, User)
        .join(User, Material.uploader_id == User.id)
        .filter(
            or_(
                Material.is_public == True,
                Material.uploader_id == current_user.id
            )
        )
    )
    # Apply filters
    if subject:
        stmt = stmt.filter(Material.subject == subject)
 
    if education_level:
        stmt = stmt.filter(Material.education_level == education_level)
 
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.filter(
            or_(
                Material.title.ilike(search_filter),
                Material.description.ilike(search_filter),
                Material.topic.ilike(search_filter)
            )
        )
 
    res_exec = await db.execute(stmt.order_by(Material.created_at.desc()))
    results = res_exec.all()
    material_list = []
    for material, uploader in results:
        material_list.append(
            MaterialResponse(
                id=str(material.id),
                title=material.title,
                description=material.description,
                file_url=material.file_url,
                file_type=material.file_type,
                file_size=material.file_size,
                subject=material.subject,
                subject_id=str(material.subject_id) if material.subject_id else None,
                topic=material.topic,
                education_level=material.education_level,
                uploader_id=str(material.uploader_id),
                uploader_name=uploader.full_name,
                is_public=material.is_public,
                allowed_students=[str(s) for s in material.allowed_students]
                if material.allowed_students
                else [],
                tags=material.tags or [],
                download_count=material.download_count,
                created_at=material.created_at,
                updated_at=material.updated_at,
            )
        )

    return material_list


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Get a specific material by ID
    Note: Students do NOT have direct access to materials, only through RAG
    """
    try:
        material_uuid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid material ID format"
        )

    result_exec = await db.execute(
        select(Material, User)
        .join(User, Material.uploader_id == User.id)
        .filter(Material.id == material_uuid)
    )
    result = result_exec.first()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )

    material, uploader = result

    # Check permissions - only teachers can access materials directly
    if material.uploader_id != current_user.id and not material.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this material",
        )

    return MaterialResponse(
        id=str(material.id),
        title=material.title,
        description=material.description,
        file_url=material.file_url,
        file_type=material.file_type,
        file_size=material.file_size,
        subject=material.subject,
        subject_id=str(material.subject_id) if material.subject_id else None,
        topic=material.topic,
        education_level=material.education_level,
        uploader_id=str(material.uploader_id),
        uploader_name=uploader.full_name,
        is_public=material.is_public,
        allowed_students=[str(s) for s in material.allowed_students]
        if material.allowed_students
        else [],
        tags=material.tags or [],
        download_count=material.download_count,
        created_at=material.created_at,
        updated_at=material.updated_at,
    )


@router.put("/{material_id}", response_model=dict)
async def update_material(
    material_id: str,
    material_data: MaterialUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Update a material's metadata
    Only the uploader can update
    """
    try:
        material_uuid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid material ID format"
        )

    material_result = await db.execute(
        select(Material)
        .filter(Material.id == material_uuid, Material.uploader_id == current_user.id)
    )
    material = material_result.scalars().first()

    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found or you don't have permission to update it",
        )

    # Parse student IDs if provided
    student_ids = None
    if material_data.allowed_students is not None:
        try:
            student_ids = [uuid.UUID(s) for s in material_data.allowed_students]

            # Verify all students belong to this teacher
            for student_id in student_ids:
                rel_res = await db.execute(
                    select(TeacherStudent)
                    .filter(
                        TeacherStudent.teacher_id == current_user.id,
                        TeacherStudent.student_id == student_id,
                    )
                )
                relationship = rel_res.scalars().first()
                if not relationship:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Student {student_id} is not in your roster",
                    )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid student ID format in allowed_students",
            )

    # Update fields
    update_data = material_data.dict(exclude_unset=True)
    if student_ids is not None:
        update_data["allowed_students"] = student_ids

    for field, value in update_data.items():
        setattr(material, field, value)

    material.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(material)
    return {"message": "Material updated successfully", "material_id": str(material.id)}


@router.delete("/{material_id}", response_model=dict)
async def delete_material(
    material_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Delete a material
    Only the uploader can delete
    """
    try:
        material_uuid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid material ID format"
        )

    material_result = await db.execute(
        select(Material)
        .filter(Material.id == material_uuid, Material.uploader_id == current_user.id)
    )
    material = material_result.scalars().first()

    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found or you don't have permission to delete it",
        )

    # Delete file from storage
    if material.file_url:
        try:
            # Extract object name from URL
            # Format: http://endpoint/bucket/object_name
            # Split by bucket name
            bucket = storage_service.bucket
            if bucket in material.file_url:
                 parts = material.file_url.split(f"/{bucket}/")
                 if len(parts) > 1:
                     object_name = parts[1]
                     storage_service.delete_file(object_name)
        except Exception as e:
            logger.error(f"Failed to delete file from storage: {e}")

    # Delete from database
    await db.delete(material)
    await db.commit()
    return {"message": "Material deleted successfully", "material_id": material_id}


@router.post("/{material_id}/download", response_model=dict)
async def download_material(
    material_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Download/access a material
    Increments download counter
    Note: Students do NOT have direct download access, only through RAG
    """
    try:
        material_uuid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid material ID format"
        )

    res_exec = await db.execute(
        select(Material, User)
        .join(User, Material.uploader_id == User.id)
        .filter(Material.id == material_uuid)
    )
    result = res_exec.first()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )

    material, uploader = result

    # Check permissions
    if current_user.role != UserRole.TEACHER and not material.is_public:
        if current_user.id not in (material.allowed_students or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this material",
            )

    # Increment download count
    material.download_count += 1
    await db.commit()

    return {
        "message": "Download ready",
        "material_id": str(material.id),
        "title": material.title,
        "file_url": material.file_url,
        "file_type": material.file_type,
        "download_count": material.download_count,
    }


@router.get("/stats/summary", response_model=dict)
async def get_materials_stats(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_material_uploader),
):
    """
    Get statistics about the teacher's materials
    """
    # Total materials
    total_count = (
        await db.execute(select(func.count(Material.id)).filter(Material.uploader_id == current_user.id))
    ).scalar() or 0

    # Public materials
    public_count = (
        await db.execute(select(func.count(Material.id)).filter(
            Material.uploader_id == current_user.id,
            Material.is_public == True
        ))
    ).scalar() or 0

    # Private materials
    private_count = total_count - public_count

    # Total downloads
    total_downloads_res = await db.execute(
        select(func.sum(Material.download_count))
        .filter(Material.uploader_id == current_user.id)
    )
    total_downloads_sum = total_downloads_res.scalar() or 0

    # Materials by subject
    from sqlalchemy import func

    subject_stats_res = await db.execute(
        select(Material.subject, func.count(Material.id).label("count"))
        .filter(Material.uploader_id == current_user.id)
        .group_by(Material.subject)
    )
    subject_stats = subject_stats_res.all()

    return {
        "total_materials": total_count,
        "public_materials": public_count,
        "private_materials": private_count,
        "total_downloads": total_downloads_sum,
        "materials_by_subject": [
            {"subject": s.subject, "count": s.count} for s in subject_stats
        ],
    }


# Note: Students do NOT have direct access to materials
# Materials are only used for RAG (Retrieval Augmented Generation) content generation
# See /rag endpoints for student-accessible content generation
