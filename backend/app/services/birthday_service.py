from datetime import datetime, timezone
from html import escape
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session

from app.models.student import StudentProfile
from app.models.user import ParentStudent, User, UserRole
from app.services.email_service import EmailService


class BirthdayService:
    def __init__(self, db: Session):
        self.db = db
        self.email_service = EmailService()

    def get_users_with_birthday_today(self) -> List[User]:
        today = datetime.now(timezone.utc)
        month_day = f"{today.month:02d}-{today.day:02d}"

        users = (
            self.db.query(User)
            .filter(
                User.role.in_([UserRole.STUDENT.value, UserRole.TEACHER.value]),
                User.date_of_birth.isnot(None),
                User.is_active == True,
            )
            .all()
        )

        birthday_users = []
        for user in users:
            dob_month_day = f"{user.date_of_birth.month:02d}-{user.date_of_birth.day:02d}"
            if dob_month_day == month_day:
                birthday_users.append(user)

        return birthday_users

    def get_students_with_birthday_today(self) -> List[User]:
        return [
            user
            for user in self.get_users_with_birthday_today()
            if self._role_value(user) == UserRole.STUDENT.value
        ]

    def get_student_parent(self, student: User) -> Optional[User]:
        relationship = (
            self.db.query(ParentStudent)
            .filter(ParentStudent.student_id == student.id)
            .first()
        )
        if relationship:
            return self.db.query(User).filter(User.id == relationship.parent_id).first()
        return None

    def get_student_profile(self, student: User) -> Optional[StudentProfile]:
        return (
            self.db.query(StudentProfile)
            .filter(StudentProfile.user_id == student.id)
            .first()
        )

    def _name(self, user: User, fallback: str) -> str:
        return user.full_name or user.first_name or fallback

    def _role_value(self, user: User) -> str:
        role = getattr(user, "role", "")
        return getattr(role, "value", role)

    def _student_context(self, student: User) -> Dict[str, Any]:
        profile = self.get_student_profile(student)
        parent = self.get_student_parent(student)
        parent_name = self._name(parent, "Parent/Guardian") if parent else None
        return {
            "guardian_name": getattr(profile, "guardian_name", None) or parent_name,
            "guardian_email": getattr(profile, "guardian_email", None) or (parent.email if parent else None),
            "education_level": getattr(profile, "education_level", None),
            "school_name": getattr(profile, "school_name", None),
            "learning_goal": getattr(profile, "course_name", None)
            or getattr(profile, "department", None)
            or "learning journey",
        }

    def _teacher_context(self, teacher: User) -> Dict[str, Any]:
        profile = getattr(teacher, "teacher_profile", None)
        return {
            "specialization": getattr(profile, "specialization", None) or "teaching",
            "impact_score": getattr(profile, "impact_score", 0) or 0,
        }

    def _render_birthday_email(
        self,
        *,
        recipient_name: str,
        celebrant_name: str,
        subject_line: str,
        intro: str,
        message: str,
        closing: str,
        accent_label: str,
    ) -> tuple[str, str, str]:
        safe_recipient = escape(recipient_name or "there")
        safe_celebrant = escape(celebrant_name or "EduNexus learner")
        safe_intro = escape(intro)
        safe_message = escape(message)
        safe_closing = escape(closing)
        safe_accent = escape(accent_label)

        html_content = f"""
        <html>
        <body style="margin:0;background:#f6f7f4;font-family:Arial,sans-serif;color:#111827;line-height:1.6;">
            <div style="max-width:640px;margin:0 auto;padding:24px;">
                <div style="background:#101827;color:#ffffff;padding:28px;border-radius:8px 8px 0 0;">
                    <p style="margin:0 0 8px;color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">EduNexus</p>
                    <h1 style="margin:0;font-size:28px;line-height:1.2;">Happy Birthday, {safe_celebrant}</h1>
                    <p style="margin:10px 0 0;color:#d1d5db;font-size:14px;">{safe_accent}</p>
                </div>
                <div style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
                    <p>Dear {safe_recipient},</p>
                    <p>{safe_intro}</p>
                    <p>{safe_message}</p>
                    <div style="background:#f8fafc;border-left:4px solid #f59e0b;padding:14px 16px;margin:20px 0;border-radius:4px;">
                        <p style="margin:0;">{safe_closing}</p>
                    </div>
                    <p style="margin-bottom:0;">Warm regards,<br><strong>The EduNexus Team</strong></p>
                </div>
                <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:16px;">EduNexus - Digital Education Platform</p>
            </div>
        </body>
        </html>
        """

        text_content = f"""
        Happy Birthday, {celebrant_name}

        Dear {recipient_name},

        {intro}

        {message}

        {closing}

        Warm regards,
        The EduNexus Team
        """

        return subject_line, html_content, text_content

    def send_student_birthday_email(self, student: User) -> bool:
        context = self._student_context(student)
        student_name = self._name(student, "Student")
        first_name = student.first_name or student_name
        sent = False

        if student.email:
            subject, html_content, text_content = self._render_birthday_email(
                recipient_name=first_name,
                celebrant_name=student_name,
                subject_line=f"Happy Birthday, {first_name} - from EduNexus",
                intro=(
                    f"Today we are celebrating you and the steady effort you are putting into "
                    f"{context.get('learning_goal') or 'your learning journey'}."
                ),
                message=(
                    "May this new year bring sharper understanding, confidence in class, "
                    "and many small wins that add up to something excellent."
                ),
                closing="Keep learning with curiosity. We are cheering you on today and in the lessons ahead.",
                accent_label=context.get("education_level") or "Learner birthday message",
            )
            sent = self.email_service.send_email(
                to_email=student.email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
            )

        guardian_email = context.get("guardian_email")
        if guardian_email:
            guardian_name = context.get("guardian_name") or "Parent/Guardian"
            subject, html_content, text_content = self._render_birthday_email(
                recipient_name=guardian_name,
                celebrant_name=student_name,
                subject_line=f"Birthday wishes for {student_name} from EduNexus",
                intro=f"Today is {student_name}'s birthday, and we wanted to mark the day with a warm note from EduNexus.",
                message=(
                    f"We are proud to support {student_name}'s learning journey. "
                    "Thank you for being part of the encouragement that helps learners grow with confidence."
                ),
                closing=f"Please help us wish {student_name} a happy birthday and a meaningful year of growth.",
                accent_label=context.get("school_name") or "Guardian copy",
            )
            sent = self.email_service.send_email(
                to_email=guardian_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
            ) or sent

        return sent

    def send_teacher_birthday_email(self, teacher: User) -> bool:
        if not teacher.email:
            return False

        context = self._teacher_context(teacher)
        teacher_name = self._name(teacher, "Teacher")
        first_name = teacher.first_name or teacher_name
        subject, html_content, text_content = self._render_birthday_email(
            recipient_name=first_name,
            celebrant_name=teacher_name,
            subject_line=f"Happy Birthday, {first_name} - from EduNexus",
            intro=f"Today we are celebrating you and the care you bring to {context['specialization']}.",
            message=(
                "Your work helps learners feel guided, challenged, and seen. "
                "We hope this new year brings renewed energy, meaningful impact, and moments that remind you why teaching matters."
            ),
            closing="Thank you for building better learning experiences with EduNexus.",
            accent_label=f"Teacher impact score: {context['impact_score']}",
        )

        return self.email_service.send_email(
            to_email=teacher.email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    def send_birthday_email(self, student: User, parent: User = None) -> bool:
        return self.send_student_birthday_email(student)

    def send_all_birthday_wishes(self) -> Dict[str, Any]:
        users = self.get_users_with_birthday_today()

        results = {
            "total_birthdays": len(users),
            "emails_sent": 0,
            "failed": 0,
            "recipients": [],
        }

        for user in users:
            role = self._role_value(user)
            success = (
                self.send_teacher_birthday_email(user)
                if role == UserRole.TEACHER.value
                else self.send_student_birthday_email(user)
            )

            if success:
                results["emails_sent"] += 1
            else:
                results["failed"] += 1

            results["recipients"].append(
                {
                    "name": user.full_name,
                    "email": user.email,
                    "role": role,
                    "sent": success,
                }
            )

        return results

    def get_upcoming_birthdays(self, days: int = 30) -> List[Dict[str, Any]]:
        today = datetime.now(timezone.utc)
        users = (
            self.db.query(User)
            .filter(
                User.role.in_([UserRole.STUDENT.value, UserRole.TEACHER.value]),
                User.date_of_birth.isnot(None),
            )
            .all()
        )

        upcoming = []
        for user in users:
            dob_this_year = user.date_of_birth.replace(year=today.year)
            if dob_this_year < today:
                dob_this_year = dob_this_year.replace(year=today.year + 1)

            days_until = (dob_this_year - today).days
            if 0 <= days_until <= days:
                upcoming.append(
                    {
                        "name": user.full_name,
                        "email": user.email,
                            "role": self._role_value(user),
                        "date_of_birth": user.date_of_birth.strftime("%Y-%m-%d"),
                        "days_until": days_until,
                    }
                )

        return sorted(upcoming, key=lambda x: x["days_until"])
