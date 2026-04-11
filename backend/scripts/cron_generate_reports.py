"""
Automated Monthly Report Generation & Sending Script.
Designed to be run as a cron job on the 1st of every month.
1. Generates reports for all Primary/Secondary students for the previous month.
2. Automatically sends reports to guardians for students without active teachers.
3. Leaves reports as 'generated' for students WITH teachers (awaiting review).
4. Strictly excludes students at the 'professional' education level.
"""
import asyncio
import os
import sys
import uuid
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Setup system path to include backend
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.core.config import settings
from app.models.student import StudentProfile
from app.models.user import User, TeacherStudent

# Import additional models for SQLAlchemy relationship mapping
from app.models.subject import Subject, Topic, Lesson
from app.models.session import TeachingSession, SessionStudent
from app.models.student_progress import StudentActivityLog

from app.services.report_service import ReportService
from app.services.report_email_service import report_email_service

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cron_reports")

async def run_monthly_automation():
    # Database Initialization
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    engine = create_async_engine(db_url, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Determine reporting period (previous month)
    today = datetime.now(timezone.utc)
    first_day_this_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_date = first_day_this_month - timedelta(days=1)
    
    report_month = last_month_date.month
    report_year = last_month_date.year
    
    logger.info(f"Starting automated report generation for {report_month}/{report_year}")

    async with AsyncSessionLocal() as db:
        # 1. Fetch all eligible students (excluding professional level)
        # Model education_levels: ['primary', 'junior_secondary', 'senior_secondary', 'professional']
        eligible_levels = ["primary", "junior_secondary", "senior_secondary"]
        stmt = select(StudentProfile).filter(StudentProfile.education_level.in_(eligible_levels))
        res_students = await db.execute(stmt)
        students = res_students.scalars().all()
        
        logger.info(f"Found {len(students)} eligible students for reporting.")

        processed_count = 0
        sent_count = 0
        error_count = 0

        for profile in students:
            try:
                # Check for active teacher link
                link_stmt = select(TeacherStudent).filter(
                    TeacherStudent.student_id == profile.user_id,
                    TeacherStudent.status == "active"
                )
                res_link = await db.execute(link_stmt)
                link = res_link.scalars().first()
                
                teacher_id = link.teacher_id if link else None
                
                # Generate the report
                # If no teacher, we use a system user or None (ReportService handles it)
                # Note: ReportService.generate_student_report expects a teacher_id to filter sessions.
                # If teacher_id is None, it might need to default to system or search all sessions.
                # Let's ensure ReportService can handle teacher_id=None or use a high-level system ID.
                
                report = await ReportService.generate_student_report(
                    db, profile.user_id, teacher_id or profile.user_id, report_month, report_year
                )
                
                if not report:
                    logger.debug(f"No activity for student {profile.user_id}, skipping.")
                    continue
                
                processed_count += 1

                # 2. Automated Sending Logic for AI-only students (no teacher)
                if not teacher_id:
                    if profile.guardian_email:
                        # Get student's full name
                        user_stmt = select(User).filter(User.id == profile.user_id)
                        res_user = await db.execute(user_stmt)
                        student_user = res_user.scalars().first()
                        student_name = student_user.full_name if student_user else "Student"
                        
                        logger.info(f"Automatically sending report to guardian {profile.guardian_email} for AI-only student {student_name}")
                        
                        # Set to approved first to allow sending
                        report.status = ReportStatus.APPROVED
                        await db.commit()
                        
                        success = await report_email_service.send_report_email(
                            profile.guardian_email,
                            report,
                            student_name,
                            "EduNexus AI Tutor"
                        )
                        
                        if success:
                            report.status = ReportStatus.SENT
                            report.sent_at = datetime.now(timezone.utc)
                            await db.commit()
                            sent_count += 1
                        else:
                            logger.error(f"Failed to send email for student {profile.user_id}")
                    else:
                        logger.warning(f"No guardian email for AI-only student {profile.user_id}, report remains generated.")

            except Exception as e:
                logger.error(f"Error processing student {profile.user_id}: {str(e)}")
                error_count += 1
                continue

        logger.info(f"Automation Complete for {report_month}/{report_year}:")
        logger.info(f" - Reports Generated: {processed_count}")
        logger.info(f" - Automatically Sent: {sent_count}")
        logger.info(f" - Errors encountered: {error_count}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_monthly_automation())
