from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.student_progress import MonthlyReport, StudentSubjectProgress
from app.models.user import User
from app.models.student import StudentProfile
from app.models.report import StudentReport
from app.core.config import settings
from app.services.chart_generator import chart_generator
from app.services.llm_service import LLMService
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)


class ReportEmailService:
    """Service for sending monthly reports to parents"""

    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.use_tls = settings.SMTP_USE_TLS
        self.from_email = settings.SMTP_FROM_EMAIL
        self.from_name = settings.SMTP_FROM_NAME
        self.llm_service = LLMService()

    def _generate_intro_letter(
        self,
        student_name: str,
        month: str,
        year: int,
        quality_score: int,
        total_sessions: int,
        attendance: int,
        trend: str,
        gender: str = "",
    ) -> str:
        """Generate personalized introduction paragraph for the report"""

        # Determine pronouns based on gender
        if gender.lower() == "male":
            pronoun = "he"
            possessive = "his"
        elif gender.lower() == "female":
            pronoun = "she"
            possessive = "her"
        else:
            pronoun = "they"
            possessive = "their"

        # Performance description
        if quality_score >= 80:
            performance_desc = f"has demonstrated excellent performance with an overall quality score of {quality_score}%"
        elif quality_score >= 60:
            performance_desc = f"has shown solid progress with an overall quality score of {quality_score}%"
        else:
            performance_desc = f"is working towards improvement with an overall quality score of {quality_score}%"

        # Session description
        if total_sessions >= 10:
            session_desc = f"attended {total_sessions} learning sessions"
        elif total_sessions >= 5:
            session_desc = f"participated in {total_sessions} learning sessions"
        else:
            session_desc = f"attended {total_sessions} session(s)"

        # Attendance description
        if attendance >= 90:
            attendance_desc = "maintained excellent attendance"
        elif attendance >= 75:
            attendance_desc = "showed good attendance"
        else:
            attendance_desc = "has room for improvement in attendance"

        # Trend description
        trend_desc = ""
        if trend == "improving":
            trend_desc = f"{pronoun.title()}r performance shows an improving trend, which is encouraging."
        elif trend == "declining":
            trend_desc = "We noticed a slight decline in performance - we're working on strategies to support improvement."
        else:
            trend_desc = f"{pronoun.title()}r performance has remained consistent throughout the month."

        intro = f"""This report covers {student_name}'s learning progress during {month} {year}. {student_name} {performance_desc}, {session_desc}, and {attendance_desc}. {trend_desc} The report includes detailed performance metrics, subject-wise progress, attendance trends, and personalized recommendations to support continued growth."""

        return intro

    async def generate_plain_language_summary(
        self, data: dict, student_name: str
    ) -> str:
        """Generate monthly progress summary for parents"""

        # Get gender from data (default to neutral)
        gender = data.get("gender", "").lower()
        pronoun = (
            "they"
            if gender not in ["male", "female"]
            else ("he" if gender == "male" else "she")
        )
        possessive = (
            "their"
            if gender not in ["male", "male"]
            else ("his" if gender == "male" else "her")
        )

        prompt = f"""Write a concise monthly progress report for a student named {student_name}.

Performance Summary:
- Sessions attended: {data.get("total_sessions", 0)}
- Attendance rate: {data.get("avg_attendance", 0):.0f}%
- Participation score: {data.get("avg_participation", 0):.0f}%
- Total learning time: {data.get("total_duration_minutes", 0)} minutes
- Overall performance score: {data.get("quality_score", 0)}/100

Quiz Results:
- Average improvement: {data.get("quiz_performance", {}).get("avg_improvement", 0):+.0f}%

Subject progress:
{chr(10).join(f"- {qs.get('subject')}: {qs.get('pre_score_avg', 0):.0f}% → {qs.get('post_score_avg', 0):.0f}% ({'+' if qs.get('improvement', 0) >= 0 else ''}{qs.get('improvement', 0):.0f}%)" for qs in data.get("quiz_performance", {}).get("by_subject", [])) if data.get("quiz_performance", {}).get("by_subject") else "- No quiz data"}

Portal activity:
- AI chats: {data.get("portal_engagement", {}).get("ai_chat_sessions", 0)}
- Materials viewed: {data.get("portal_engagement", {}).get("materials_accessed", 0)}

Key strengths: {", ".join(data.get("strengths", [])[:3]) if data.get("strengths") else "None noted"}

Areas to develop: {", ".join(data.get("areas_for_improvement", [])[:3]) if data.get("areas_for_improvement") else "None noted"}

Teacher's notes: {data.get("teacher_notes", "No additional comments")}

Write this as a professional educational report - warm but concise. 2-3 short paragraphs. No emojis. No AI references. Sound like a real teacher wrote it. Use correct pronouns (he/she/they) based on the student's gender if known."""

        try:
            summary = await self.llm_service.generate(
                prompt=prompt,
                temperature=0.5,
                max_tokens=600,
                system_prompt="You are an experienced educator writing a monthly student progress report. Write naturally, professionally, and warmly. Use correct pronouns (he/she/they). No AI references.",
            )
            return (
                summary
                if summary
                else self._fallback_summary(data, student_name, gender)
            )
        except Exception as e:
            logger.warning(f"LLM generation failed: {e}, using fallback")
            return self._fallback_summary(data, student_name, gender)

    def _fallback_summary(self, data: dict, student_name: str, gender: str = "") -> str:
        """Fallback summary if LLM is not available"""
        pronoun = (
            "they"
            if gender not in ["male", "female"]
            else ("he" if gender == "male" else "she")
        )
        possessive = (
            "their"
            if gender not in ["male", "female"]
            else ("his" if gender == "male" else "her")
        )

        score = data.get("quality_score", 0)
        trend = data.get("performance_trend", "Stable")
        sessions = data.get("total_sessions", 0)
        attendance = data.get("avg_attendance", 0)
        improvement = data.get("quiz_performance", {}).get("avg_improvement", 0)
        strengths = data.get("strengths", [])
        improvements = data.get("areas_for_improvement", [])

        trend_text = (
            "improving"
            if trend == "Improving"
            else "steady"
            if trend == "Stable"
            else "needs attention"
        )

        summary = f"""{student_name} has made good progress this month, attending {sessions} sessions with {attendance:.0f}% attendance rate. {pronoun.title()} achieved an overall performance score of {score}/100, showing a {trend_text} learning trend.

Quiz results show an average improvement of {improvement:.0f}%. This demonstrates consistent growth in understanding.

{("Strengths: " + ", ".join(strengths[:2]) + ".") if strengths else ""}
{("Areas to develop: " + ", ".join(improvements[:2]) + ".") if improvements else ""}

{pronoun.title()} engaged in {data.get("portal_engagement", {}).get("ai_chat_sessions", 0)} learning sessions independently.

Continue encouraging regular study habits for continued progress.

Mr. Emmanuel Okonkwo
Subject Teacher
Lagos International School"""
        return summary

    def _generate_bar_chart_svg(
        self, data: list, title: str, color: str = "#2d2a26", max_value: int = 100
    ) -> str:
        """Generate SVG bar chart"""
        if not data:
            return ""

        bar_width = 30
        bar_gap = 15
        chart_height = 150
        chart_width = len(data) * (bar_width + bar_gap) + 40
        max_val = max(max_value, max((d.get("value", 0) for d in data), default=100))

        bars = ""
        for i, item in enumerate(data):
            value = item.get("value", 0)
            bar_height = (value / max_val) * chart_height if max_val > 0 else 0
            x = 35 + i * (bar_width + bar_gap)
            y = chart_height - bar_height + 10
            label = item.get("date", "")[:6]  # Shorten label

            bars += f"""
            <rect x="{x}" y="{y}" width="{bar_width}" height="{bar_height}" fill="{color}" rx="4" />
            <text x="{x + bar_width / 2}" y="{chart_height + 22}" text-anchor="middle" font-size="10" fill="#6B7280">{label}</text>
            <text x="{x + bar_width / 2}" y="{y - 5}" text-anchor="middle" font-size="9" fill="#374151">{value}%</text>
            """

        return f"""
        <svg width="{chart_width}" height="{chart_height + 45}" viewBox="0 0 {chart_width} {chart_height + 45}" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid lines -->
            <line x1="30" y1="10" x2="30" y2="{chart_height + 10}" stroke="#E5E7EB" stroke-width="1" />
            <line x1="30" y1="{chart_height * 0.25 + 10}" x2="{chart_width}" y2="{chart_height * 0.25 + 10}" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="4" />
            <line x1="30" y1="{chart_height * 0.5 + 10}" x2="{chart_width}" y2="{chart_height * 0.5 + 10}" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="4" />
            <line x1="30" y1="{chart_height * 0.75 + 10}" x2="{chart_width}" y2="{chart_height * 0.75 + 10}" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="4" />
            <!-- Y-axis labels -->
            <text x="25" y="15" text-anchor="end" font-size="9" fill="#9CA3AF">{max_val}</text>
            <text x="25" y="{chart_height * 0.25 + 13}" text-anchor="end" font-size="9" fill="#9CA3AF">{int(max_val * 0.75)}</text>
            <text x="25" y="{chart_height * 0.5 + 13}" text-anchor="end" font-size="9" fill="#9CA3AF">{int(max_val * 0.5)}</text>
            <text x="25" y="{chart_height * 0.75 + 13}" text-anchor="end" font-size="9" fill="#9CA3AF">{int(max_val * 0.25)}</text>
            <text x="25" y="{chart_height + 13}" text-anchor="end" font-size="9" fill="#9CA3AF">0</text>
            {bars}
        </svg>
        """

    def _generate_line_chart_svg(
        self, data: list, title: str, color: str = "#2d2a26"
    ) -> str:
        """Generate SVG line chart"""
        if not data or len(data) < 2:
            return ""

        chart_height = 150
        chart_width = 350
        padding = 40
        max_val = 100
        min_val = 0

        points = ""
        area_points = f"{padding},{chart_height - padding}"

        for i, item in enumerate(data):
            value = item.get("value", 0)
            x = padding + (i / (len(data) - 1)) * (chart_width - 2 * padding)
            y = (
                chart_height
                - padding
                - ((value - min_val) / (max_val - min_val))
                * (chart_height - 2 * padding)
                if max_val > min_val
                else chart_height / 2
            )
            points += f"{x},{y} "
            area_points += f" {x},{y}"

        area_points += f" {chart_width - padding},{chart_height - padding} {padding},{chart_height - padding}"

        # Generate dots
        dots = ""
        for i, item in enumerate(data):
            value = item.get("value", 0)
            x = padding + (i / (len(data) - 1)) * (chart_width - 2 * padding)
            y = (
                chart_height
                - padding
                - ((value - min_val) / (max_val - min_val))
                * (chart_height - 2 * padding)
                if max_val > min_val
                else chart_height / 2
            )
            dots += f'<circle cx="{x}" cy="{y}" r="4" fill="white" stroke="{color}" stroke-width="2" />'

        return f"""
        <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid -->
            <line x1="{padding}" y1="{chart_height - padding}" x2="{chart_width - padding}" y2="{chart_height - padding}" stroke="#E5E7EB" stroke-width="1" />
            <line x1="{padding}" y1="{padding}" x2="{padding}" y2="{chart_height - padding}" stroke="#E5E7EB" stroke-width="1" />
            <line x1="{padding}" y1="{chart_height / 2}" x2="{chart_width - padding}" y2="{chart_height / 2}" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="4" />
            <!-- Area fill -->
            <polygon points="{area_points}" fill="{color}" fill-opacity="0.1" />
            <!-- Line -->
            <polyline points="{points}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <!-- Dots -->
            {dots}
        </svg>
        """

    def _generate_quiz_comparison_svg(self, data: list) -> str:
        """Generate SVG bar chart comparing pre and post quiz scores"""
        if not data:
            return ""

        chart_height = 150
        chart_width = 400
        padding = 40
        bar_width = 25
        bar_gap = 8
        group_gap = 20
        max_val = 100

        bars = ""
        for i, item in enumerate(data):
            pre = item.get("pre", 0)
            post = item.get("post", 0)
            group_x = padding + i * (2 * bar_width + bar_gap + group_gap)
            label = (item.get("date", "") or "Q" + str(i + 1))[:5]

            pre_height = (pre / max_val) * (chart_height - 2 * padding)
            post_height = (post / max_val) * (chart_height - 2 * padding)

            bars += f"""
            <rect x="{group_x}" y="{chart_height - padding - pre_height}" width="{bar_width}" height="{pre_height}" fill="#F59E0B" rx="3" />
            <rect x="{group_x + bar_width + bar_gap}" y="{chart_height - padding - post_height}" width="{bar_width}" height="{post_height}" fill="#10B981" rx="3" />
            <text x="{group_x + bar_width}" y="{chart_height - padding + 18}" text-anchor="middle" font-size="8" fill="#6B7280">Pre</text>
            <text x="{group_x + bar_width + bar_gap + bar_width / 2}" y="{chart_height - padding + 18}" text-anchor="middle" font-size="8" fill="#6B7280">Post</text>
            <text x="{group_x + bar_width + bar_gap / 2}" y="{chart_height + 22}" text-anchor="middle" font-size="9" fill="#6B7280">{label}</text>
            """

        return f"""
        <svg width="{chart_width}" height="{chart_height + 35}" viewBox="0 0 {chart_width} {chart_height + 35}" xmlns="http://www.w3.org/2000/svg">
            <line x1="{padding}" y1="{chart_height - padding}" x2="{chart_width - padding}" y2="{chart_height - padding}" stroke="#E5E7EB" stroke-width="1" />
            <line x1="{padding}" y1="{padding}" x2="{padding}" y2="{chart_height - padding}" stroke="#E5E7EB" stroke-width="1" />
            {bars}
            <!-- Legend -->
            <rect x="{chart_width - 120}" y="8" width="12" height="12" fill="#F59E0B" rx="2" />
            <text x="{chart_width - 102}" y="18" font-size="10" fill="#374151">Pre-Quiz</text>
            <rect x="{chart_width - 60}" y="8" width="12" height="12" fill="#10B981" rx="2" />
            <text x="{chart_width - 42}" y="18" font-size="10" fill="#374151">Post-Quiz</text>
        </svg>
        """

    def _generate_radar_chart_svg(self, scores: dict) -> str:
        """Generate SVG radar chart for strengths/weaknesses analysis"""
        if not scores:
            return ""

        # Map scores to 5 axes
        axes = ["Attendance", "Participation", "Quiz", "Engagement", "Consistency"]
        values = [
            scores.get("attendance", 0),
            scores.get("participation", 0),
            scores.get("quiz", 0),
            scores.get("engagement", 0),
            scores.get("consistency", 0),
        ]

        center_x, center_y = 100, 90
        radius = 70
        angle_step = 360 / len(axes)

        # Generate polygon points
        points = ""
        for i, val in enumerate(values):
            angle = (angle_step * i - 90) * 3.14159 / 180
            x = center_x + (val / 100) * radius * (1 if val >= 0 else -1) * abs(
                1 if val >= 0 else 1
            ) * (1 if val >= 0 else 0)
            x = center_x + radius * (val / 100) * (1 if i % 2 == 0 else 0.8) * (
                1 if i < 3 else 0.9
            )
            angle = (angle_step * i - 90) * 3.14159 / 180
            px = center_x + radius * (val / 100) * 0.8 * (1 + (i % 2) * 0.25)
            py = center_y + radius * (val / 100) * 0.6 * (1 if i < 2 else 0.85)
            if i == 0:
                px = center_x
                py = center_y - radius * (val / 100)
            elif i == 1:
                px = center_x + radius * (val / 100) * 0.9
                py = center_y - radius * (val / 100) * 0.4
            elif i == 2:
                px = center_x + radius * (val / 100) * 0.9
                py = center_y + radius * (val / 100) * 0.4
            elif i == 3:
                px = center_x
                py = center_y + radius * (val / 100)
            elif i == 4:
                px = center_x - radius * (val / 100) * 0.9
                py = center_y + radius * (val / 100) * 0.4
            points += f"{px},{py} "

        # Simple bar representation instead of complex radar
        bar_width = 35
        chart_height = 120

        bars = ""
        for i, (label, val) in enumerate(zip(axes, values)):
            x = 20 + i * 65
            bar_height = (val / 100) * (chart_height - 20)
            color = "#10B981" if val >= 70 else "#F59E0B" if val >= 50 else "#EF4444"
            bars += f"""
            <rect x="{x}" y="{chart_height - bar_height}" width="{bar_width}" height="{bar_height}" fill="{color}" rx="4" />
            <text x="{x + bar_width / 2}" y="{chart_height + 12}" text-anchor="middle" font-size="8" fill="#6B7280">{label[:4]}</text>
            <text x="{x + bar_width / 2}" y="{chart_height - bar_height - 5}" text-anchor="middle" font-size="9" fill="#374151">{val}%</text>
            """

        return f"""
        <svg width="350" height="{chart_height + 30}" viewBox="0 0 350 {chart_height + 30}" xmlns="http://www.w3.org/2000/svg">
            <line x1="15" y1="{chart_height}" x2="335" y2="{chart_height}" stroke="#E5E7EB" stroke-width="1" />
            <line x1="15" y1="10" x2="15" y2="{chart_height}" stroke="#E5E7EB" stroke-width="1" />
            {bars}
        </svg>
        """

    async def generate_report_html(
        self,
        report: StudentReport,
        student_name: str,
        teacher_name: str = "Your Teacher",
    ) -> str:
        """Generate comprehensive HTML content for monthly report with charts"""

        # Generate plain language summary using LLM
        report_data = report.report_data if hasattr(report, "report_data") else {}
        if isinstance(report_data, str):
            import json

            try:
                report_data = json.loads(report_data)
            except:
                report_data = {}

        # Add month/year to data for the summary
        report_data["month"] = getattr(report, "month", 1)
        report_data["year"] = getattr(report, "year", 2026)

        plain_summary = await self.generate_plain_language_summary(
            report_data, student_name
        )

        month_names = [
            "",
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ]

        month_name_val = (
            getattr(report, "month", report.month)
            if hasattr(report, "month")
            else report.month
        )
        year_val = (
            getattr(report, "year", report.year)
            if hasattr(report, "year")
            else report.year
        )

        month_name = (
            month_names[month_name_val]
            if month_name_val and 1 <= int(month_name_val) <= 12
            else str(month_name_val)
        )
        report_year = int(year_val) if year_val else datetime.now().year

        # Extract report data - handle JSONB column properly
        raw_data = report.report_data
        if raw_data is None:
            data = {}
        else:
            try:
                data = dict(raw_data) if hasattr(raw_data, "items") else {}
            except Exception:
                data = {}

        # Basic metrics
        total_sessions = data.get("total_sessions", 0)
        total_duration = data.get("total_duration_minutes", 0)
        avg_attendance = data.get("avg_attendance", 0)
        avg_participation = data.get("avg_participation", 0)
        quality_score = data.get("quality_score", 0)
        assimilation_level = data.get("assimilation_level", "N/A")
        performance_trend = data.get("performance_trend", "Stable")

        # Basic metrics
        total_sessions = data.get("total_sessions", 0)
        total_duration = data.get("total_duration_minutes", 0)
        avg_attendance = data.get("avg_attendance", 0)
        avg_participation = data.get("avg_participation", 0)
        quality_score = data.get("quality_score", 0)
        assimilation_level = data.get("assimilation_level", "N/A")
        performance_trend = data.get("performance_trend", "Stable")

        # Quiz & Assignment data
        quiz_perf = data.get("quiz_performance", {})
        avg_pre_score = quiz_perf.get("avg_pre_score", 0)
        avg_post_score = quiz_perf.get("avg_post_score", 0)
        avg_improvement = quiz_perf.get("avg_improvement", 0)
        quiz_timeline = quiz_perf.get("quiz_results", [])
        quiz_by_subject = quiz_perf.get("by_subject", [])

        assignments = data.get("assignments", {})
        assignment_completion = assignments.get("completion_rate", 0)
        assignments_by_subject = assignments.get("by_subject", [])

        # Portal Engagement Data
        portal = data.get("portal_engagement", {})
        portal_total_activities = portal.get("total_activities", 0)
        portal_time_spent = portal.get("total_time_minutes", 0)
        ai_chat_count = portal.get("ai_chat_sessions", 0)
        ai_chat_time = portal.get("ai_chat_time_minutes", 0)
        materials_count = portal.get("materials_accessed", 0)
        materials_time = portal.get("materials_time_minutes", 0)
        portal_quiz_count = portal.get("portal_quizzes", 0)
        portal_quiz_avg = portal.get("portal_quiz_avg_score", 0)
        videos_count = portal.get("videos_watched", 0)
        videos_time = portal.get("videos_time_minutes", 0)
        topic_requests = portal.get("topic_requests", 0)
        activity_breakdown = portal.get("activity_breakdown", [])

        # Strengths & Areas
        strengths = data.get("strengths", [])
        areas_for_improvement = data.get("areas_for_improvement", [])

        # Chart data
        charts = data.get("charts", {})
        attendance_timeline = charts.get("attendance_timeline", [])
        participation_timeline = charts.get("participation_timeline", [])

        # Sessions
        sessions = data.get("sessions", [])

        # Teacher notes
        teacher_notes = report.teacher_notes or "No additional notes from teacher."

        # Determine trend color
        trend_color = "#10B981"
        trend_emoji = "📈"
        if performance_trend == "Declining":
            trend_color = "#EF4444"
            trend_emoji = "📉"
        elif performance_trend == "Stable":
            trend_color = "#F59E0B"
            trend_emoji = "➡️"

        # Generate matplotlib charts
        charts = chart_generator.generate_comprehensive_report(
            data, month_name, report_year
        )

        attendance_chart = charts.get("attendance_trend", "")
        participation_chart = charts.get("participation_trend", "")
        quiz_chart = charts.get("quiz_comparison", "")
        performance_chart = charts.get("performance_breakdown", "")
        portal_chart = charts.get("portal_activity", "")
        session_perf_chart = charts.get("session_performance", "")

        # Wrap charts in img tags
        def wrap_in_img(chart_data: str) -> str:
            if chart_data and chart_data.startswith("data:image"):
                return f'<img src="{chart_data}" style="max-width: 100%; height: auto; border-radius: 8px;" alt="Chart"/>'
            return chart_data

        attendance_chart_img = wrap_in_img(attendance_chart)
        participation_chart_img = wrap_in_img(participation_chart)
        quiz_chart_img = wrap_in_img(quiz_chart)
        performance_chart_img = wrap_in_img(performance_chart)
        portal_chart_img = wrap_in_img(portal_chart)
        session_perf_chart_img = wrap_in_img(session_perf_chart)

        # Get gender for pronouns
        student_gender = data.get("gender", "")

        # Generate personalized introduction
        intro_paragraph = self._generate_intro_letter(
            student_name,
            month_name,
            report_year,
            quality_score,
            total_sessions,
            avg_attendance,
            performance_trend,
            student_gender,
        )

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Monthly Progress Report</title>
        </head>
        <body style="font-family: 'Segoe UI', 'Inter', Arial, sans-serif; line-height: 1.6; color: #2d2a26; margin: 0; padding: 0; background-color: #fafaf9;">
            <div style="max-width: 700px; margin: 0 auto; padding: 20px; position: relative;">
                
                <!-- Watermark Background -->
                <div style="position: absolute; top: 50%; left: 0; right: 0; transform: translateY(-50%); text-align: center; z-index: 0; pointer-events: none; opacity: 0.15;">
                    <img src="https://i.imgur.com/B6dmS2B.png" alt="EduNexus" style="width: 800px; height: auto;">
                </div>
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #4a4743 0%, #6b7280 100%); color: white; padding: 20px; border-radius: 15px 15px 0 0; text-align: center; position: relative; z-index: 1;">
                    <img src="https://i.imgur.com/B6dmS2B.png" alt="EduNexus" style="width: 500px; height: auto; margin-bottom: 10px;">
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">EduNexus</div>
                    <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">{
            month_name
        } {report_year}</p>
                </div>
                
                <!-- Introduction Letter -->
                <div style="background: white; padding: 25px; border-left: 4px solid #d97706; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    <p style="font-size: 16px; font-weight: 600; margin: 0 0 15px 0; color: #2d2a26;">Dear Parent/Guardian,</p>
                    <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 14px;">
                        We are pleased to present this monthly progress report for <strong>{
            student_name
        }</strong>. 
                        This comprehensive report provides an overview of your child's academic performance, 
                        engagement, and growth during {month_name} {report_year}.
                    </p>
                    <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 14px;">
                        {intro_paragraph}
                    </p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">
                        If you have any questions or would like to discuss this report further, please do not hesitate 
                        to reach out to the teaching team. We value your partnership in your child's education.
                    </p>
                    <p style="margin: 15px 0 0 0; color: #2d2a26; font-size: 14px;">
                        Best regards,<br>
                        <strong>The EduNexus Teaching Team</strong>
                    </p>
                </div>
                
                <!-- Student Info -->
                <div style="background: white; padding: 25px; border-radius: 0 0 15px 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    <h2 style="color: #2d2a26; margin-top: 0; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 16px;">Student Information</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6B7280;">Student Name</td>
                            <td style="padding: 8px 0; font-weight: 600;">{
            student_name
        }</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6B7280;">Teacher</td>
                            <td style="padding: 8px 0;">{teacher_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6B7280;">Report Date</td>
                            <td style="padding: 8px 0;">{
            datetime.now(timezone.utc).strftime("%B %d, %Y")
        }</td>
                        </tr>
                    </table>
                </div>
                
                <!-- Overall Quality Score -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h2 style="color: #2d2a26; margin-top: 0;">⭐ Overall Performance Score</h2>
                    <div style="text-align: center; padding: 20px 0;">
                        <div style="font-size: 64px; font-weight: bold; color: #2d2a26; line-height: 1;">{
            quality_score
        }<span style="font-size: 24px; color: #9CA3AF;">/100</span></div>
                        <div style="font-size: 18px; color: {
            trend_color
        }; margin-top: 10px;">
                            {trend_emoji} {performance_trend} Trend
                        </div>
                    </div>
                    <div style="background: #F3F4F6; height: 16px; border-radius: 8px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #2d2a26, #4a4743); height: 100%; width: {
            quality_score
        }%; border-radius: 8px;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #6B7280;">
                        <span>Needs Improvement</span>
                        <span>Average</span>
                        <span>Excellent</span>
                    </div>
                </div>
                
                <!-- Key Metrics Cards -->
                <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px;">
                    <div style="flex: 1; min-width: 100px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                        <div style="font-size: 28px; font-weight: bold; color: #2d2a26;">{
            total_sessions
        }</div>
                        <div style="font-size: 12px; color: #6B7280;">Sessions</div>
                    </div>
                    <div style="flex: 1; min-width: 100px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                        <div style="font-size: 28px; font-weight: bold; color: #059669;">{
            total_duration
        }</div>
                        <div style="font-size: 12px; color: #6B7280;">Minutes</div>
                    </div>
                    <div style="flex: 1; min-width: 100px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                        <div style="font-size: 28px; font-weight: bold; color: #D97706;">{
            avg_attendance:.0f}%</div>
                        <div style="font-size: 12px; color: #6B7280;">Attendance</div>
                    </div>
                    <div style="flex: 1; min-width: 100px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                        <div style="font-size: 28px; font-weight: bold; color: #DB2777;">{
            avg_participation:.0f}%</div>
                        <div style="font-size: 12px; color: #6B7280;">Participation</div>
                    </div>
                </div>
                
                <!-- Attendance Chart -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #2d2a26; margin-top: 0;">📊 Attendance Trend</h3>
                    {
            attendance_chart_img
            if attendance_chart_img
            else '<p style="color:#9CA3AF;text-align:center;">No attendance data available</p>'
        }
                </div>
                
                <!-- Participation Chart -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #10B981; margin-top: 0;">📈 Participation Trend</h3>
                    {
            participation_chart_img
            if participation_chart_img
            else '<p style="color:#9CA3AF;text-align:center;">No participation data available</p>'
        }
                </div>
                
                <!-- Participation Chart -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #10B981; margin-top: 0;">📈 Participation Trend</h3>
                    {
            participation_chart
            if participation_chart
            else '<p style="color:#9CA3AF;text-align:center;">No participation data available</p>'
        }
                </div>
                
                <!-- Quiz Performance -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #4a4743; margin-top: 0;">📝 Quiz Performance</h3>
                    
                    <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #FEF3C7; border-radius: 10px;">
                            <div style="font-size: 24px; font-weight: bold; color: #D97706;">{
            avg_pre_score:.0f}%</div>
                            <div style="font-size: 11px; color: #92400E;">Pre-Quiz Avg</div>
                        </div>
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #D1FAE5; border-radius: 10px;">
                            <div style="font-size: 24px; font-weight: bold; color: #059669;">{
            avg_post_score:.0f}%</div>
                            <div style="font-size: 11px; color: #065F46;">Post-Quiz Avg</div>
                        </div>
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #EEF2FF; border-radius: 10px;">
                            <div style="font-size: 24px; font-weight: bold; color: #2d2a26;">{
            avg_improvement:+.0f}%</div>
                            <div style="font-size: 11px; color: #3730A3;">Improvement</div>
                        </div>
                    </div>
                    
                    {quiz_chart_img if quiz_chart_img else ""}
                    
                    <!-- Quiz by Subject Table -->
                    {
            f'''
                    <div style="margin-top: 25px;">
                        <h4 style="color: #4a4743; margin: 15px 0 10px 0;">📊 Quiz Performance by Subject</h4>
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <thead>
                                <tr style="background: #F3E8FF;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #E5E7EB;">Subject</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Sessions</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Pre Avg</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Post Avg</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Improvement</th>
                                </tr>
                            </thead>
                            <tbody>
                                {
                "".join(
                    '<tr style="border-bottom: 1px solid #E5E7EB;">'
                    f'<td style="padding: 8px;">{qs.get("subject", "-")}</td>'
                    f'<td style="padding: 8px; text-align: center;">{qs.get("sessions_count", 0)}</td>'
                    f'<td style="padding: 8px; text-align: center; color: #D97706;">{int(qs.get("pre_score_avg") or 0)}%</td>'
                    f'<td style="padding: 8px; text-align: center; color: #059669;">{int(qs.get("post_score_avg") or 0)}%</td>'
                    f'<td style="padding: 8px; text-align: center; color: {"#059669" if (qs.get("improvement") or 0) >= 0 else "#DC2626"};">{"+" if (qs.get("improvement") or 0) >= 0 else ""}{int(qs.get("improvement") or 0)}%</td>'
                    "</tr>"
                    for qs in quiz_by_subject
                )
            }
                            </tbody>
                        </table>
                    </div>
                    '''
            if quiz_by_subject
            else ""
        }
                </div>
                
                <!-- Assignments by Subject -->
                {
            f'''
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #059669; margin-top: 0;">📋 Assignments by Subject</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: #D1FAE5;">
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #E5E7EB;">Subject</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Total Assigned</th>
                            </tr>
                        </thead>
                        <tbody>
                            {
                "".join(
                    '<tr style="border-bottom: 1px solid #E5E7EB;">'
                    f'<td style="padding: 8px;">{asub.get("subject", "-")}</td>'
                    f'<td style="padding: 8px; text-align: center;">{asub.get("total_assigned", 0)}</td>'
                    "</tr>"
                    for asub in assignments_by_subject
                )
            }
                        </tbody>
                    </table>
                </div>
                '''
            if assignments_by_subject
            else ""
        }
                
                <!-- Performance Breakdown -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #2d2a26; margin-top: 0;">🎯 Performance Breakdown</h3>
                    {performance_chart_img}
                </div>
                
                <!-- Strengths -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #10B981; margin-top: 0;">🌟 Strengths</h3>
                    {
            "".join(
                f'<div style="padding: 12px; background: #D1FAE5; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #10B981;">✓ {s}</div>'
                for s in strengths
            )
            if strengths
            else '<p style="color:#9CA3AF;">No strengths identified yet</p>'
        }
                </div>
                
                <!-- Areas for Improvement -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #F59E0B; margin-top: 0;">🎯 Areas for Improvement</h3>
                    {
            "".join(
                f'<div style="padding: 12px; background: #FEF3C7; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #F59E0B;">→ {a}</div>'
                for a in areas_for_improvement
            )
            if areas_for_improvement
            else '<p style="color:#9CA3AF;">No specific areas identified</p>'
        }
                </div>
                
                <!-- Student Portal Engagement -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #4a4743; margin-top: 0;">💻 Student Portal Activity</h3>
                    <p style="color: #6B7280; font-size: 14px; margin-bottom: 20px;">Self-directed learning activities on the EduNexus platform</p>
                    
                    {
            f'''
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #F3E8FF; border-radius: 10px;">
                            <div style="font-size: 22px; font-weight: bold; color: #4a4743;">{portal_total_activities}</div>
                            <div style="font-size: 10px; color: #6B7280;">Total Activities</div>
                        </div>
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #F3E8FF; border-radius: 10px;">
                            <div style="font-size: 22px; font-weight: bold; color: #4a4743;">{portal_time_spent}</div>
                            <div style="font-size: 10px; color: #6B7280;">Minutes Active</div>
                        </div>
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #DBEAFE; border-radius: 10px;">
                            <div style="font-size: 22px; font-weight: bold; color: #2563EB;">{ai_chat_count}</div>
                            <div style="font-size: 10px; color: #6B7280;">AI Chats</div>
                        </div>
                        <div style="flex: 1; min-width: 80px; text-align: center; padding: 15px; background: #EEF2FF; border-radius: 10px;">
                            <div style="font-size: 22px; font-weight: bold; color: #DC2626;">{videos_count}</div>
                            <div style="font-size: 10px; color: #6B7280;">Videos</div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 15px;">
                        <div style="padding: 12px; background: #F9FAFB; border-radius: 8px; text-align: center;">
                            <div style="font-size: 20px;">📚</div>
                            <div style="font-size: 18px; font-weight: bold; color: #2d2a26;">{materials_count}</div>
                            <div style="font-size: 10px; color: #6B7280;">Materials Accessed</div>
                        </div>
                        <div style="padding: 12px; background: #F9FAFB; border-radius: 8px; text-align: center;">
                            <div style="font-size: 20px;">📝</div>
                            <div style="font-size: 18px; font-weight: bold; color: #4a4743;">{portal_quiz_count}</div>
                            <div style="font-size: 10px; color: #6B7280;">Portal Quizzes</div>
                            {f'<div style="font-size: 11px; color: #059669;">Avg: {portal_quiz_avg:.0f}%</div>' if portal_quiz_count > 0 else ""}
                        </div>
                        <div style="padding: 12px; background: #F9FAFB; border-radius: 8px; text-align: center;">
                            <div style="font-size: 20px;">🎬</div>
                            <div style="font-size: 18px; font-weight: bold; color: #DC2626;">{videos_count}</div>
                            <div style="font-size: 10px; color: #6B7280;">Videos Watched</div>
                        </div>
                    </div>
                    
                    {f'<div style="margin-top: 15px; padding: 12px; background: #FEF3C7; border-radius: 8px; text-align: center;"><span style="font-size: 14px;">🎯</span> <strong>{topic_requests}</strong> topic requests made</div>' if topic_requests > 0 else ""}
                    
                    <!-- Portal Activity Chart -->
                    {f'<div style="margin-top: 20px;"><img src="{portal_chart_img}" style="width:100%;max-width:400px;height:auto;display:block;margin:0 auto;" /></div>' if portal_chart_img else ""}
                    '''
            if portal_total_activities > 0
            else '<p style="color:#9CA3AF;text-align:center;padding:20px;">No portal activity recorded this month.<br>Encourage student to use AI chat and study materials!</p>'
        }
                </div>
                
                <!-- Learning Level -->
                <div style="background: linear-gradient(135deg, #EEF2FF, #E0E7FF); padding: 25px; border-radius: 15px; margin-top: 20px;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 15px;">
                        <span style="font-size: 40px;">🎓</span>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #6B7280;">Learning Level</div>
                            <div style="font-size: 28px; font-weight: bold; color: #2d2a26;">{
            assimilation_level
        }</div>
                        </div>
                    </div>
                </div>
                
                <!-- Session Details Table -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #2d2a26; margin-top: 0;">📊 Session Performance Overview</h3>
                    <p style="color:#6B7280;font-size:13px;">Attendance and participation across all sessions</p>
                    {
            f'<img src="{session_perf_chart}" style="width:100%;max-width:600px;height:auto;margin:15px 0;" />'
            if session_perf_chart
            else ""
        }
                </div>
                
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #2d2a26; margin-top: 0;">📅 Session Details</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                        <thead>
                            <tr style="background: #F9FAFB;">
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #E5E7EB;">Date</th>
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #E5E7EB;">Subject</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Min</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Attend</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #E5E7EB;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {
            "".join(
                f'''<tr style="border-bottom: 1px solid #E5E7EB;">
                                <td style="padding: 8px;">{s.get("date", "-")}</td>
                                <td style="padding: 8px;">{s.get("subject", "-")}</td>
                                <td style="padding: 8px; text-align: center;">{s.get("duration", "-")}</td>
                                <td style="padding: 8px; text-align: center;">{s.get("attendance", 0):.0f}%</td>
                                <td style="padding: 8px; text-align: center;">{"✅" if s.get("status") == "completed" else "📍"}</td>
                            </tr>'''
                for s in sessions[:8]
            )
            if sessions
            else '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9CA3AF;">No session data</td></tr>'
        }
                        </tbody>
                    </table>
                </div>
                
                <!-- Plain Language Summary -->
                <div style="background: linear-gradient(135deg, #EEF2FF, #E0E7FF); padding: 25px; border-radius: 15px; margin-top: 20px; border-left: 5px solid #2d2a26;">
                    <h3 style="color: #2d2a26; margin-top: 0;">📖 Easy-to-Read Summary</h3>
                    <div style="background: white; padding: 20px; border-radius: 10px; margin-top: 15px; line-height: 1.8; color: #374151;">
                        {
            plain_summary.replace(chr(10), "<br/>").replace("• ", "<br/>• ")
        }
                    </div>
                </div>
                
                <!-- Teacher's Notes -->
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px;">
                    <h3 style="color: #2d2a26; margin-top: 0;">💬 Teacher's Notes</h3>
                    <div style="background: #FEF3C7; padding: 20px; border-radius: 10px; margin-top: 15px; border-left: 4px solid #F59E0B;">
                        <p style="margin: 0; color: #92400E;">{teacher_notes}</p>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="text-align: center; margin-top: 30px; padding: 20px; color: #6B7280; font-size: 14px;">
                    <p style="margin: 0;">Thank you for choosing EduNexus!</p>
                    <p style="margin: 5px 0 0 0; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                    <p style="margin: 10px 0 0 0; font-size: 12px; opacity: 0.7;">© {
            datetime.now(timezone.utc).year
        } EduNexus. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        return {
            "html": html,
            "month_name": month_name,
            "year": report_year,
            "plain_summary": plain_summary,
            "quiz_by_subject": quiz_by_subject,
            "assignments_by_subject": assignments_by_subject
        }

    async def send_report_email(
        self,
        to_email: str,
        report: StudentReport,
        student_name: str,
        teacher_name: str = "Your Teacher",
    ) -> bool:
        """Send monthly report to parent email"""
        try:
            result = await self.generate_report_html(report, student_name, teacher_name)
            html_content = result["html"]
            month_name_val = result["month_name"]
            report_year = result["year"]
            plain_summary = result["plain_summary"]
            quiz_by_subject = result["quiz_by_subject"]
            assignments_by_subject = result["assignments_by_subject"]

            msg = MIMEMultipart("alternative")
            msg["Subject"] = (
                f"📚 {student_name}'s EduNexus Progress Report - {month_name_val}/{report_year}"
            )
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email

            # Plain text version
            raw_data = report.report_data
            data = dict(raw_data) if raw_data else {}
            text_content = f"""
{student_name}'s EduNexus Progress Report - {month_name_val}/{report_year}

Dear Parent/Guardian,

📖 EASY-TO-READ SUMMARY:
{plain_summary}

══════════════════════════════════════════════════

OVERALL SCORE: {data.get("quality_score", 0)}/100 ({data.get("performance_trend", "Stable")} Trend)
Learning Level: {data.get("assimilation_level", "N/A")}

KEY METRICS:
• Total Sessions: {data.get("total_sessions", 0)}
• Minutes Learned: {data.get("total_duration_minutes", 0)}
• Average Attendance: {data.get("avg_attendance", 0):.1f}%
• Average Participation: {data.get("avg_participation", 0):.1f}%

QUIZ PERFORMANCE:
• Pre-Quiz Average: {data.get("quiz_performance", {}).get("avg_pre_score", 0):.1f}%
• Post-Quiz Average: {data.get("quiz_performance", {}).get("avg_post_score", 0):.1f}%
• Average Improvement: {data.get("quiz_performance", {}).get("avg_improvement", 0):+.1f}%

QUIZ BY SUBJECT:
{chr(10).join(f"• {qs.get('subject')}: Pre {qs.get('pre_score_avg', 0):.0f}% → Post {qs.get('post_score_avg', 0):.0f}% ({'+' if qs.get('improvement', 0) >= 0 else ''}{qs.get('improvement', 0):.0f}%)" for qs in quiz_by_subject) if quiz_by_subject else "No quiz data by subject"}

ASSIGNMENTS BY SUBJECT:
{chr(10).join(f"• {asub.get('subject')}: {asub.get('total_assigned', 0)} assigned" for asub in assignments_by_subject) if assignments_by_subject else "No assignment data"}

STRENGTHS:
{chr(10).join(f"✓ {s}" for s in data.get("strengths", [])[:5])}

AREAS FOR IMPROVEMENT:
{chr(10).join(f"→ {a}" for a in data.get("areas_for_improvement", [])[:5])}

TEACHER'S NOTES:
{report.teacher_notes or "No additional notes."}

To view the complete interactive report with charts, please visit your EduNexus dashboard.

Thank you for your continued support!

Best regards,
EduNexus Team
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            msg.attach(part1)
            msg.attach(part2)

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())

            logger.info(f"Report sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send report email: {e}")
            return False


report_email_service = ReportEmailService()
