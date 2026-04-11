import sys
import os
import json

# Add backend to path so we can import app.constants
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.constants import (
    EDUCATION_LEVELS, 
    EDUCATION_CATEGORIES, 
    DEPARTMENTS, 
    BASE_EXAM_SUBJECTS, 
    DEPARTMENT_SUBJECTS,
    JAMB_MAX_SUBJECTS,
    WAEC_NECO_RANGE
)


def generate():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(
        script_dir, "..", "..", "frontend", "src", "constants", "educationLevels.ts"
    )
    output_path = os.path.normpath(output_path)

    lines = [
        "// AUTO-GENERATED — do not edit manually",
        "// Source: backend/app/constants.py",
        "// Regenerate: python backend/scripts/generate_frontend_constants.py",
        "",
        f"export const EDUCATION_CATEGORIES = {json.dumps(EDUCATION_CATEGORIES, indent=2)} as const;",
        "",
        "export const EDUCATION_LEVELS = [",
    ]

    # Keeping EDUCATION_LEVELS for backward compatibility
    # Map values to labels for the simple list
    label_map = {}
    for cat in EDUCATION_CATEGORIES.values():
        for level in cat["levels"]:
            label_map[level["value"]] = level["label"]

    for value in EDUCATION_LEVELS:
        label = label_map.get(value, value.replace("_", " ").title())
        lines.append(f"  {{ value: '{value}', label: '{label}' }},")

    lines.append("] as const;")
    lines.append("")
    lines.append(f"export const DEPARTMENTS = {json.dumps(DEPARTMENTS)} as const;")
    lines.append("")
    lines.append(f"export const BASE_EXAM_SUBJECTS = {json.dumps(BASE_EXAM_SUBJECTS, indent=2)} as const;")
    lines.append("")
    lines.append(f"export const DEPARTMENT_SUBJECTS = {json.dumps(DEPARTMENT_SUBJECTS, indent=2)} as const;")
    lines.append("")
    lines.append(f"export const JAMB_MAX_SUBJECTS = {JAMB_MAX_SUBJECTS};")
    lines.append("")
    lines.append(f"export const WAEC_NECO_RANGE = {list(WAEC_NECO_RANGE)};")
    lines.append("")
    lines.append("export type EducationLevel = typeof EDUCATION_LEVELS[number]['value'];")
    lines.append("")

    content = "\n".join(lines)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

    print(f"✅ Generated {output_path}")


if __name__ == "__main__":
    generate()
