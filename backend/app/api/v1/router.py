from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    students,
    subjects,
    sessions,
    ai,
    assessments,
    proctoring,
    teachers,
    materials,
    admin,
    rag,
    reports,
    student_progress,
    teacher_students,
    test_email,
    ai_coordinator,
    notifications,
    messages,
    videos,
    readings,
    mock_exams,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(students.router, prefix="/students", tags=["students"])
api_router.include_router(teachers.router, prefix="/teachers", tags=["teachers"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(rag.router, prefix="/rag", tags=["rag"])
api_router.include_router(subjects.router, prefix="/subjects", tags=["subjects"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(ai_coordinator.router, tags=["ai-coordinator"])
api_router.include_router(
    assessments.router, prefix="/assessments", tags=["assessments"]
)
api_router.include_router(proctoring.router, prefix="/proctoring", tags=["proctoring"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(
    student_progress.router, prefix="/student", tags=["student-progress"]
)
api_router.include_router(
    teacher_students.router, prefix="/teacher-students", tags=["teacher-students"]
)
api_router.include_router(test_email.router, prefix="/utils", tags=["utils"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(messages.router, prefix="/messages", tags=["messages"])
api_router.include_router(videos.router, prefix="/videos", tags=["videos"])
api_router.include_router(readings.router, prefix="/readings", tags=["readings"])
api_router.include_router(mock_exams.router, prefix="/mock-exams", tags=["mock-exams"])
