import logging
from typing import List, Dict, Any, Optional

# NO MORE HEAVY IMPORTS (matplotlib, seaborn, pandas, numpy)
# This service now returns raw data for the frontend to render using Recharts.

logger = logging.getLogger(__name__)

class ChartGenerator:
    """Provides structured data for frontend charting (Recharts)"""

    @staticmethod
    def generate_attendance_chart(data: List[Dict], month: str) -> Dict[str, Any]:
        """Format attendance data for Recharts"""
        if not data:
            return {"data": [], "title": f"Attendance Trend - {month}"}
        
        # We just return the raw data objects; Recharts will handle the rest
        return {
            "data": data,
            "title": f"Attendance Trend - {month}",
            "type": "bar",
            "xAxis": "date",
            "yAxis": "value"
        }

    @staticmethod
    def generate_participation_chart(data: List[Dict], month: str) -> Dict[str, Any]:
        """Format participation data for Recharts"""
        return {
            "data": data,
            "title": f"Participation Trend - {month}",
            "type": "line",
            "xAxis": "date",
            "yAxis": "value"
        }

    @staticmethod
    def generate_quiz_comparison_chart(data: List[Dict], month: str) -> Dict[str, Any]:
        """Format pre vs post quiz scores for Recharts"""
        return {
            "data": data,
            "title": "Quiz Score Comparison - Pre vs Post",
            "type": "grouped-bar",
            "keys": ["pre", "post"]
        }

    @staticmethod
    def generate_performance_radar(metrics: Dict[str, float], title: str = "Performance Metrics") -> Dict[str, Any]:
        """Format performance metrics for Radar chart"""
        radar_data = [{"subject": k, "value": v} for k, v in metrics.items()]
        return {
            "data": radar_data,
            "title": title,
            "type": "radar"
        }

    @staticmethod
    def generate_performance_bar_chart(metrics: Dict[str, float], title: str = "Performance Breakdown") -> Dict[str, Any]:
        """Format performance metrics for horizontal bar chart"""
        bar_data = [{"category": k, "value": v} for k, v in metrics.items()]
        return {
            "data": bar_data,
            "title": title,
            "type": "horizontal-bar"
        }

    @staticmethod
    def generate_portal_activity_chart(activity_data: List[Dict], title: str = "Portal Activity Breakdown") -> Dict[str, Any]:
        """Format portal activity for Pie chart"""
        return {
            "data": activity_data,
            "title": title,
            "type": "pie"
        }

    @staticmethod
    def generate_session_performance_chart(sessions: List[Dict], title: str = "Session Performance") -> Dict[str, Any]:
        """Format session-by-session performance for Recharts"""
        return {
            "data": sessions,
            "title": title,
            "type": "composed"
        }

    @staticmethod
    def generate_comprehensive_report(report_data: Dict[str, Any], month_name: str, year: int) -> Dict[str, Any]:
        """Collect all structured data for a monthly report"""
        charts = {}
        charts_data = report_data.get("charts", {})

        # Use the formatters above to build a standard response for the frontend
        charts["attendance_trend"] = ChartGenerator.generate_attendance_chart(
            charts_data.get("attendance_timeline", []), f"{month_name} {year}"
        )
        charts["participation_trend"] = ChartGenerator.generate_participation_chart(
            charts_data.get("participation_timeline", []), f"{month_name} {year}"
        )
        charts["quiz_comparison"] = ChartGenerator.generate_quiz_comparison_chart(
            charts_data.get("quiz_timeline", []), f"{month_name} {year}"
        )

        perf_metrics = {
            "Attendance": report_data.get("avg_attendance", 0),
            "Participation": report_data.get("avg_participation", 0),
            "Quiz": report_data.get("quiz_performance", {}).get("avg_post_score", 0),
            "Quality": report_data.get("quality_score", 0),
        }
        charts["performance_breakdown"] = ChartGenerator.generate_performance_bar_chart(
            perf_metrics, "Overall Performance Breakdown"
        )

        activity_breakdown = report_data.get("portal_engagement", {}).get("activity_breakdown", [])
        charts["portal_activity"] = ChartGenerator.generate_portal_activity_chart(
            activity_breakdown, "Portal Activity Breakdown"
        )

        sessions = report_data.get("sessions", [])
        charts["session_performance"] = ChartGenerator.generate_session_performance_chart(
            sessions, "Session-by-Session Performance"
        )

        return charts

# Singleton instance
chart_generator = ChartGenerator()
