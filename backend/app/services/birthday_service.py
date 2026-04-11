from datetime import datetime, timezone
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.user import User
from app.services.email_service import EmailService


class BirthdayService:
    def __init__(self, db: Session):
        self.db = db
        self.email_service = EmailService(db)

    def get_students_with_birthday_today(self) -> List[User]:
        today = datetime.now(timezone.utc)
        month_day = f"{today.month:02d}-{today.day:02d}"

        students = (
            self.db.query(User)
            .filter(User.role == "student", User.date_of_birth.isnot(None))
            .all()
        )

        birthday_students = []
        for student in students:
            if student.date_of_birth:
                dob_month_day = (
                    f"{student.date_of_birth.month:02d}-{student.date_of_birth.day:02d}"
                )
                if dob_month_day == month_day:
                    birthday_students.append(student)

        return birthday_students

    def get_student_parent(self, student: User) -> User:
        from app.models.relationships import ParentStudent

        relationship = (
            self.db.query(ParentStudent)
            .filter(ParentStudent.student_id == student.id)
            .first()
        )

        if relationship:
            return self.db.query(User).filter(User.id == relationship.parent_id).first()
        return None

    def send_birthday_email(self, student: User, parent: User) -> bool:
        if not parent or not parent.email:
            return False

        subject = f"Happy Birthday to {student.full_name} from EduNexus!"

        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #1e3a5f, #2c5282); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }}
                .content {{ background: #f0f7ff; padding: 30px; border-radius: 0 0 12px 12px; }}
                .birthday-icon {{ font-size: 48px; margin-bottom: 10px; }}
                h1 {{ margin: 0; font-size: 24px; }}
                p {{ font-size: 16px; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="birthday-icon">🎂</div>
                    <h1>Happy Birthday!</h1>
                </div>
                <div class="content">
                    <p>Dear Parent,</p>
                    <p>Today is a special day! It's <strong>{student.full_name}'s birthday</strong>!</p>
                    <p>From all of us at EduNexus, we wish {student.full_name} a wonderful birthday filled with joy, learning, and amazing discoveries.</p>
                    <p>May this new year of life bring exciting opportunities for growth and learning!</p>
                    <p>Best wishes,<br>The EduNexus Team</p>
                </div>
                <div class="footer">
                    <p>EduNexus - AI-Powered Learning Platform</p>
                </div>
            </div>
        </body>
        </html>
        """

        return self.email_service.send_email(
            to_email=parent.email, subject=subject, html_content=html_content
        )

    def send_all_birthday_wishes(self) -> Dict[str, Any]:
        students = self.get_students_with_birthday_today()

        results = {
            "total_birthdays": len(students),
            "emails_sent": 0,
            "failed": 0,
            "students": [],
        }

        for student in students:
            parent = self.get_student_parent(student)
            if parent:
                success = self.send_birthday_email(student, parent)
                if success:
                    results["emails_sent"] += 1
                else:
                    results["failed"] += 1
            else:
                results["failed"] += 1

            results["students"].append(
                {
                    "name": student.full_name,
                    "email": student.email,
                    "parent_email": parent.email if parent else None,
                }
            )

        return results

    def get_upcoming_birthdays(self, days: int = 30) -> List[Dict[str, Any]]:
        today = datetime.now(timezone.utc)
        students = (
            self.db.query(User)
            .filter(User.role == "student", User.date_of_birth.isnot(None))
            .all()
        )

        upcoming = []
        for student in students:
            if student.date_of_birth:
                dob_this_year = student.date_of_birth.replace(year=today.year)
                if dob_this_year < today:
                    dob_this_year = dob_this_year.replace(year=today.year + 1)

                days_until = (dob_this_year - today).days
                if 0 <= days_until <= days:
                    upcoming.append(
                        {
                            "student_name": student.full_name,
                            "student_email": student.email,
                            "date_of_birth": student.date_of_birth.strftime("%Y-%m-%d"),
                            "days_until": days_until,
                        }
                    )

        return sorted(upcoming, key=lambda x: x["days_until"])
