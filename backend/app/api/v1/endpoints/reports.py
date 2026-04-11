from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import logging

from app.db.database import get_async_db
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.teachers import require_teacher
from app.models.report import StudentReport, ReportStatus
from app.models.student import StudentProfile
from app.services.report_service import ReportService
from app.services.report_email_service import report_email_service
from app.models.user import User
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class ApproveReportRequest(BaseModel):
    teacher_notes: Optional[str] = None


class GenerateReportRequest(BaseModel):
    month: int
    year: int


@router.get("/", response_model=List[dict])
async def get_my_reports(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    report_status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(require_teacher),
):
    """Get all reports for the current teacher"""
    stmt = select(StudentReport).filter(StudentReport.teacher_id == current_user.id)
    if month:
        stmt = stmt.filter(StudentReport.month == month)
    if year:
        stmt = stmt.filter(StudentReport.year == year)
    if report_status:
        stmt = stmt.filter(StudentReport.status == report_status)

    res_reports = await db.execute(stmt.order_by(StudentReport.created_at.desc()))
    reports = res_reports.scalars().all()

    results = []
    for r in reports:
        # Include student info and guardian email
        res_user = await db.execute(select(User).filter(User.id == r.student_id))
        student = res_user.scalars().first()
        student_name = student.full_name if student else "Unknown"

        # Get guardian email from student profile
        guardian_email = None
        res_prof = await db.execute(
            select(StudentProfile).filter(StudentProfile.user_id == r.student_id)
        )
        profile = res_prof.scalars().first()
        if profile:
            guardian_email = profile.guardian_email

        results.append(
            {
                "id": str(r.id),
                "student_id": str(r.student_id),
                "student_name": student_name,
                "guardian_email": guardian_email,
                "month": r.month,
                "year": r.year,
                "status": r.status,
                "created_at": r.created_at,
                "report_data": r.report_data,
                "teacher_notes": r.teacher_notes,
                "approved_at": r.approved_at,
                "sent_at": r.sent_at,
            }
        )

    return results


@router.post("/generate", response_model=dict)
async def generate_reports(
    request: GenerateReportRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(require_teacher),
):
    """Manually trigger report generation for a month"""
    count = await ReportService.generate_monthly_reports(
        db, current_user.id, request.month, request.year
    )
    return {
        "message": f"Generated {count} reports for {request.month}/{request.year}",
        "count": count,
    }


@router.get("/{report_id}", response_model=dict)
async def get_report_details(
    report_id: str, db: AsyncSession = Depends(get_async_db), current_user=Depends(require_teacher)
):
    """Get detailed report info"""
    try:
        report_uuid = uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid report ID")

    res_report = await db.execute(
        select(StudentReport).filter(
            StudentReport.id == report_uuid, StudentReport.teacher_id == current_user.id
        )
    )
    report = res_report.scalars().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Get student info
    res_user = await db.execute(select(User).filter(User.id == report.student_id))
    student = res_user.scalars().first()

    # Get guardian email
    guardian_email = None
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == report.student_id)
    )
    profile = res_prof.scalars().first()
    if profile:
        guardian_email = profile.guardian_email

    return {
        "id": str(report.id),
        "student_id": str(report.student_id),
        "student_name": student.full_name if student else "Unknown",
        "guardian_email": guardian_email,
        "month": report.month,
        "year": report.year,
        "status": report.status,
        "report_data": report.report_data,
        "teacher_notes": report.teacher_notes,
        "created_at": report.created_at,
        "approved_at": report.approved_at,
        "sent_at": report.sent_at,
    }


@router.put("/{report_id}/approve", response_model=dict)
async def approve_report(
    report_id: str,
    request: ApproveReportRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(require_teacher),
):
    """Approve and automatically email the report to the guardian"""
    try:
        report_uuid = uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid report ID")

    try:
        # 1. Update status to approved in the Service
        report = await ReportService.approve_report(db, report_uuid, request.teacher_notes)
        
        # 2. Automatically trigger email sending
        # Get student info
        res_user = await db.execute(select(User).filter(User.id == report.student_id))
        student = res_user.scalars().first()
        
        # Get guardian email from student profile
        guardian_email = None
        res_prof = await db.execute(
            select(StudentProfile).filter(StudentProfile.user_id == report.student_id)
        )
        profile = res_prof.scalars().first()
        if profile:
            guardian_email = profile.guardian_email
            
        if guardian_email:
            teacher_name = current_user.full_name or "Teacher"
            # Send the email with the report
            # We await for immediate feedback and status update
            email_success = await report_email_service.send_report_email(
                guardian_email,
                report,
                student.full_name if student else "Student",
                teacher_name,
            )
            
            if email_success:
                report.status = ReportStatus.SENT
                report.sent_at = datetime.now(timezone.utc)
                await db.commit()
                return {
                    "message": f"Report approved and sent to {guardian_email}",
                    "id": str(report.id),
                    "status": report.status,
                    "email_sent": True
                }
        
        # If no guardian email or email failed, just return approved status
        return {
            "message": "Report approved successfully (Email not sent - check guardian email in profile)",
            "id": str(report.id),
            "status": report.status,
            "email_sent": False
        }
    except Exception as e:
        logger.error(f"Error in approve_report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to approve report: {str(e)}")


@router.post("/{report_id}/send", response_model=dict)
async def send_report(
    report_id: str, db: AsyncSession = Depends(get_async_db), current_user=Depends(require_teacher)
):
    """Send report to guardian via email"""
    try:
        report_uuid = uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid report ID")

    # Get the report
    res_report = await db.execute(
        select(StudentReport).filter(
            StudentReport.id == report_uuid, StudentReport.teacher_id == current_user.id
        )
    )
    report = res_report.scalars().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Check if report is approved
    if report.status != ReportStatus.APPROVED:
        raise HTTPException(
            status_code=400,
            detail="Report must be approved before sending. Please review and approve the report first.",
        )

    # Get student info
    res_user = await db.execute(select(User).filter(User.id == report.student_id))
    student = res_user.scalars().first()
    if not student:
         raise HTTPException(status_code=404, detail="Student not found")

    # Get guardian email from student profile
    guardian_email = None
    res_prof = await db.execute(
        select(StudentProfile).filter(StudentProfile.user_id == student.id)
    )
    profile = res_prof.scalars().first()
    if profile:
        guardian_email = profile.guardian_email

    if not guardian_email:
        raise HTTPException(
            status_code=400,
            detail="No guardian email found for this student. Please add a guardian email to the student profile.",
        )

    # Get teacher name for the email
    teacher_name = current_user.full_name or "Teacher"

    # Send the email with the report
    success = await report_email_service.send_report_email(
        guardian_email,
        report,
        student.full_name,
        teacher_name,
    )

    if success:
        report.status = ReportStatus.SENT
        report.sent_at = datetime.now(timezone.utc)
        await db.commit()
        return {
            "message": f"Report sent successfully to {guardian_email}",
            "id": str(report.id),
            "status": report.status,
        }
    else:
        raise HTTPException(
            status_code=500, detail="Failed to send report email. Please try again."
        )
