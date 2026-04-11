import base64
import io
import matplotlib

matplotlib.use("Agg")  # Use non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from typing import List, Dict, Any, Optional

# Set style
sns.set_style("whitegrid")
plt.rcParams["figure.figsize"] = (10, 6)
plt.rcParams["font.size"] = 10


class ChartGenerator:
    """Generate professional charts for reports using matplotlib and seaborn"""

    @staticmethod
    def _save_to_base64(fig) -> str:
        """Save matplotlib figure to base64 string"""
        buffer = io.BytesIO()
        fig.savefig(
            buffer,
            format="png",
            dpi=100,
            bbox_inches="tight",
            facecolor="white",
            edgecolor="none",
        )
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        plt.close(fig)
        return f"data:image/png;base64,{img_base64}"

    @staticmethod
    def generate_attendance_chart(data: List[Dict], month: str) -> str:
        """Generate bar chart for attendance over sessions"""
        if not data:
            return ""

        fig, ax = plt.subplots(figsize=(10, 5))

        dates = [d.get("date", "")[:5] for d in data]  # Shorten dates
        values = [d.get("value", 0) for d in data]

        bars = ax.bar(
            range(len(values)), values, color="#2d2a26", alpha=0.8, edgecolor="#4a4743"
        )

        # Add value labels on bars
        for bar, val in zip(bars, values):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 1,
                f"{val:.0f}%",
                ha="center",
                va="bottom",
                fontsize=9,
                fontweight="bold",
            )

        ax.set_ylim(0, max(values) * 1.15)
        ax.set_xticks(range(len(dates)))
        ax.set_xticklabels(dates, rotation=45, ha="right")
        ax.set_ylabel("Attendance (%)", fontsize=11)
        ax.set_xlabel("Session", fontsize=11)
        ax.set_title(
            f"Attendance Trend - {month}", fontsize=14, fontweight="bold", pad=15
        )

        # Style improvements
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.yaxis.grid(False)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_participation_chart(data: List[Dict], month: str) -> str:
        """Generate line chart for participation over time"""
        if not data or len(data) < 2:
            return ""

        fig, ax = plt.subplots(figsize=(10, 5))

        dates = [d.get("date", "")[:5] for d in data]
        values = [d.get("value", 0) for d in data]

        # Line plot with markers
        ax.plot(
            range(len(values)),
            values,
            marker="o",
            markersize=10,
            linewidth=2.5,
            color="#10B981",
            markerfacecolor="white",
            markeredgecolor="#10B981",
            markeredgewidth=2,
        )

        # Fill under the line
        ax.fill_between(range(len(values)), values, alpha=0.2, color="#10B981")

        # Add value labels
        for i, val in enumerate(values):
            ax.annotate(
                f"{val:.0f}%",
                (i, val),
                textcoords="offset points",
                xytext=(0, 10),
                ha="center",
                fontsize=9,
                fontweight="bold",
            )

        ax.set_ylim(0, max(values) * 1.15)
        ax.set_xticks(range(len(dates)))
        ax.set_xticklabels(dates, rotation=45, ha="right")
        ax.set_ylabel("Participation Score (%)", fontsize=11)
        ax.set_xlabel("Session", fontsize=11)
        ax.set_title(
            f"Participation Trend - {month}", fontsize=14, fontweight="bold", pad=15
        )

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.yaxis.grid(False)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_quiz_comparison_chart(data: List[Dict], month: str) -> str:
        """Generate grouped bar chart for pre vs post quiz scores"""
        if not data:
            return ""

        fig, ax = plt.subplots(figsize=(10, 5))

        labels = [f"Quiz {i + 1}" for i in range(len(data))]
        pre_scores = [d.get("pre", 0) for d in data]
        post_scores = [d.get("post", 0) for d in data]

        x = np.arange(len(labels))
        width = 0.35

        pre_bars = ax.bar(
            x - width / 2,
            pre_scores,
            width,
            label="Pre-Quiz",
            color="#F59E0B",
            alpha=0.9,
        )
        post_bars = ax.bar(
            x + width / 2,
            post_scores,
            width,
            label="Post-Quiz",
            color="#10B981",
            alpha=0.9,
        )

        # Add value labels
        for bar in pre_bars:
            height = bar.get_height()
            ax.annotate(
                f"{height:.0f}%",
                xy=(bar.get_x() + bar.get_width() / 2, height),
                xytext=(0, 3),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=8,
            )
        for bar in post_bars:
            height = bar.get_height()
            ax.annotate(
                f"{height:.0f}%",
                xy=(bar.get_x() + bar.get_width() / 2, height),
                xytext=(0, 3),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=8,
            )

        ax.set_ylabel("Score (%)", fontsize=11)
        ax.set_xlabel("Quiz", fontsize=11)
        ax.set_title(
            "Quiz Score Comparison - Pre vs Post",
            fontsize=14,
            fontweight="bold",
            pad=15,
        )
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.legend(loc="upper left", framealpha=0.9)
        ax.set_ylim(0, 110)

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.yaxis.grid(False)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_performance_radar(
        metrics: Dict[str, float], title: str = "Performance Metrics"
    ) -> str:
        """Generate radar chart for multiple performance metrics"""
        if not metrics:
            return ""

        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(projection="polar"))

        categories = list(metrics.keys())
        values = list(metrics.values())

        # Number of variables
        num_vars = len(categories)

        # Compute angle for each category
        angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
        angles += angles[:1]  # Complete the loop
        values += values[:1]

        # Plot
        ax.plot(angles, values, "o-", linewidth=2.5, color="#2d2a26", markersize=8)
        ax.fill(angles, values, alpha=0.25, color="#2d2a26")

        # Set category labels
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(categories, fontsize=10)

        # Set radial limits
        ax.set_ylim(0, 100)
        ax.set_yticks([25, 50, 75, 100])
        ax.set_yticklabels(["25%", "50%", "75%", "100%"], fontsize=8)

        ax.set_title(title, fontsize=14, fontweight="bold", pad=20)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_performance_bar_chart(
        metrics: Dict[str, float], title: str = "Performance Breakdown"
    ) -> str:
        """Generate horizontal bar chart for performance metrics"""
        if not metrics:
            return ""

        fig, ax = plt.subplots(figsize=(10, 5))

        categories = list(metrics.keys())
        values = list(metrics.values())

        # Color based on value
        colors = [
            "#10B981" if v >= 70 else "#F59E0B" if v >= 50 else "#EF4444"
            for v in values
        ]

        y_pos = np.arange(len(categories))
        bars = ax.barh(
            y_pos, values, color=colors, alpha=0.85, edgecolor="white", height=0.6
        )

        # Add value labels
        for bar, val in zip(bars, values):
            ax.text(
                bar.get_width() + 2,
                bar.get_y() + bar.get_height() / 2,
                f"{val:.0f}%",
                va="center",
                fontsize=10,
                fontweight="bold",
            )

        ax.set_yticks(y_pos)
        ax.set_yticklabels(categories)
        ax.set_xlim(0, 115)
        ax.set_xlabel("Score (%)", fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold", pad=15)

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.xaxis.grid(False)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_portal_activity_chart(
        activity_data: List[Dict], title: str = "Portal Activity Breakdown"
    ) -> str:
        """Generate pie chart for portal activity breakdown"""
        if not activity_data:
            return ""

        fig, ax = plt.subplots(figsize=(8, 8))

        labels = [
            d.get("type", "Unknown").replace("_", " ").title() for d in activity_data
        ]
        sizes = [d.get("count", 0) for d in activity_data]

        # Filter out zero values
        non_zero = [(l, s) for l, s in zip(labels, sizes) if s > 0]
        if not non_zero:
            return ""

        labels, sizes = zip(*non_zero)

        # Color palette
        colors = sns.color_palette("viridis", len(labels))

        wedges, texts, autotexts = ax.pie(
            sizes,
            labels=labels,
            autopct="%1.1f%%",
            colors=colors,
            startangle=90,
            wedgeprops=dict(width=0.5, edgecolor="white"),
        )

        for autotext in autotexts:
            autotext.set_fontsize(10)
            autotext.set_fontweight("bold")

        ax.set_title(title, fontsize=14, fontweight="bold", pad=15)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_session_performance_chart(
        sessions: List[Dict], title: str = "Session Performance"
    ) -> str:
        """Generate multi-metric chart showing attendance and participation per session"""
        if not sessions:
            return ""

        fig, ax = plt.subplots(figsize=(12, 6))

        session_labels = [
            s.get("date", f"S{s.get('index', i + 1)}")[:5]
            for i, s in enumerate(sessions)
        ]
        attendance = [s.get("attendance", 0) for s in sessions]
        participation = [s.get("participation", 0) for s in sessions]

        x = np.arange(len(session_labels))
        width = 0.35

        att_bars = ax.bar(
            x - width / 2,
            attendance,
            width,
            label="Attendance",
            color="#2d2a26",
            alpha=0.85,
        )
        part_bars = ax.bar(
            x + width / 2,
            participation,
            width,
            label="Participation",
            color="#10B981",
            alpha=0.85,
        )

        ax.set_ylabel("Score (%)", fontsize=11)
        ax.set_xlabel("Session Date", fontsize=11)
        ax.set_title(title, fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(session_labels, rotation=45, ha="right")
        ax.legend(loc="upper right", framealpha=0.9)
        ax.set_ylim(0, 110)

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.yaxis.grid(False)

        return ChartGenerator._save_to_base64(fig)

    @staticmethod
    def generate_comprehensive_report(
        report_data: Dict[str, Any], month_name: str, year: int
    ) -> Dict[str, str]:
        """Generate all charts for a monthly report and return as base64 strings"""
        charts = {}

        # Get data
        charts_data = report_data.get("charts", {})

        # 1. Attendance trend
        attendance_data = charts_data.get("attendance_timeline", [])
        if attendance_data:
            charts["attendance_trend"] = ChartGenerator.generate_attendance_chart(
                attendance_data, f"{month_name} {year}"
            )

        # 2. Participation trend
        participation_data = charts_data.get("participation_timeline", [])
        if participation_data:
            charts["participation_trend"] = ChartGenerator.generate_participation_chart(
                participation_data, f"{month_name} {year}"
            )

        # 3. Quiz comparison
        quiz_data = charts_data.get("quiz_timeline", [])
        if quiz_data:
            charts["quiz_comparison"] = ChartGenerator.generate_quiz_comparison_chart(
                quiz_data, f"{month_name} {year}"
            )

        # 4. Performance breakdown bar chart
        perf_metrics = {
            "Attendance": report_data.get("avg_attendance", 0),
            "Participation": report_data.get("avg_participation", 0),
            "Quiz": report_data.get("quiz_performance", {}).get("avg_post_score", 0),
            "Quality": report_data.get("quality_score", 0),
        }
        charts["performance_breakdown"] = ChartGenerator.generate_performance_bar_chart(
            perf_metrics, "Overall Performance Breakdown"
        )

        # 5. Portal activity pie chart
        portal_data = report_data.get("portal_engagement", {})
        activity_breakdown = portal_data.get("activity_breakdown", [])
        if activity_breakdown:
            charts["portal_activity"] = ChartGenerator.generate_portal_activity_chart(
                activity_breakdown, "Portal Activity Breakdown"
            )

        # 6. Session performance (attendance + participation per session)
        sessions = report_data.get("sessions", [])
        if sessions:
            charts["session_performance"] = (
                ChartGenerator.generate_session_performance_chart(
                    sessions, "Session-by-Session Performance"
                )
            )

        return charts


# Singleton instance
chart_generator = ChartGenerator()
